import { t, tk } from '../../i18n';
import { occupiedRoomIds, type AppState } from '../state';
import { minutesUntil, parseHHmm, phaseAt, MORNING_HHMM } from '../time';
import {
  PRIORITY,
  type AgentEvent,
  type PriorityLevel,
  type Room,
  type Soundscape,
  type ToolCall,
  type ToolSource,
  type TriggerType,
} from '../types';
import { interpret } from '../voice';
import { phaseProtocol, rulesFor } from './protocols';
import { TRIGGER_PROFILES } from './triggerProfiles';

/**
 * Motor de políticas determinista y explicable: evento → lista de llamadas a funciones.
 * Cada llamada lleva su prioridad y su motivo legible. No modifica estado: solo planifica.
 */

export interface PolicyContext {
  event: AgentEvent;
  state: AppState;
}

class CallBuilder {
  private n = 0;
  readonly calls: ToolCall[] = [];
  constructor(
    private readonly event: AgentEvent,
    private readonly source: ToolSource,
  ) {}

  add(name: string, args: Record<string, unknown>, priority: PriorityLevel, reason: string): void {
    this.n += 1;
    this.calls.push({
      id: `${this.event.id}-${this.n}`,
      name,
      args,
      priority,
      reason,
      eventId: this.event.id,
      source: this.source,
    });
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function targetRooms(state: AppState, roomId: string | null): Room[] {
  const ids = roomId && roomId !== 'all' ? [roomId] : occupiedRoomIds(state);
  return ids.map((id) => state.rooms[id]).filter((r): r is Room => !!r && r.occupied);
}

function minutesUntilMorning(nowMin: number): number {
  return Math.max(1, Math.round(minutesUntil(nowMin, parseHHmm(MORNING_HHMM))));
}

function categoryText(room: Room): string {
  return room.category ? tk('category', room.category) : t('category.none');
}

/* ------------------------------------------------------------------ */

function planTrigger(ctx: PolicyContext, b: CallBuilder): void {
  const { event, state } = ctx;
  const type = str(event.payload.type) as TriggerType | null;
  if (!type || !(type in TRIGGER_PROFILES)) return;
  const profile = TRIGGER_PROFILES[type];
  const rooms = targetRooms(state, str(event.payload.roomId));
  const now = state.clock.nowMin;
  const typeLabel = tk('trigger', type);
  const duration =
    profile.durationMode === 'untilMorning'
      ? minutesUntilMorning(now)
      : profile.durationMode === 'fixed'
        ? (num(event.payload.durationMin) ?? profile.defaultDuration)
        : undefined;

  for (const room of rooms) {
    if (!room.auto) {
      if (profile.notify) {
        b.add(
          'notify_staff',
          {
            room: room.id,
            message: t('policy.notifyTrigger', { type: typeLabel, room: room.id }),
            urgency: profile.notify,
          },
          profile.priority,
          t('reason.autoOffNotifyOnly', { type: typeLabel }),
        );
      }
      continue;
    }
    const args: Record<string, unknown> = { room: room.id, protocol: profile.protocol };
    if (duration !== undefined) args.durationMin = duration;
    if (profile.restoreOnEnd) args.restoreOnEnd = true;
    b.add(
      'apply_protocol',
      args,
      profile.priority,
      t('reason.trigger', {
        type: typeLabel,
        protocol: tk('protocol', profile.protocol),
        category: categoryText(room),
      }),
    );
    if (profile.notify) {
      b.add(
        'notify_staff',
        {
          room: room.id,
          message: t('policy.notifyTrigger', { type: typeLabel, room: room.id }),
          urgency: profile.notify,
        },
        profile.priority,
        t('reason.procedureNotice', { type: typeLabel }),
      );
    }
  }

  const selected = state.ui.selectedRoom;
  const announceRoom = rooms.length === 1 ? rooms[0]?.id : rooms.find((r) => r.id === selected)?.id;
  if (profile.announce && announceRoom) {
    b.add(
      'speak',
      { text: t('policy.announce', { type: typeLabel }), room: announceRoom },
      profile.priority,
      t('reason.announce'),
    );
  }
}

/** Protocolo circadiano de una sala (usado al cambiar de fase y al reevaluar). */
function planCircadian(
  state: AppState,
  room: Room,
  b: CallBuilder,
  opts: { skipIfSame: boolean; reason: string },
): void {
  const now = state.clock.nowMin;
  const phase = phaseAt(now);
  const protocol = phaseProtocol(phase, room.category);
  if (opts.skipIfSame && room.protocol === protocol) return;
  const night = phase === 'night';
  const args: Record<string, unknown> = { room: room.id, protocol };
  if (night) args.durationMin = minutesUntilMorning(now);
  b.add(
    'apply_protocol',
    args,
    night ? PRIORITY.SLEEP : PRIORITY.THERAPEUTIC,
    t(night ? 'reason.sleep' : phase === 'morning' ? 'reason.morning' : 'reason.daytime', {
      protocol: tk('protocol', protocol),
      category: categoryText(room),
      reason: opts.reason,
    }),
  );
}

function planTimeChange(ctx: PolicyContext, b: CallBuilder): void {
  for (const room of targetRooms(ctx.state, null)) {
    if (!room.auto) continue;
    planCircadian(ctx.state, room, b, { skipIfSame: true, reason: t('reason.phaseChange') });
  }
}

function maskingSoundscape(room: Room): Soundscape {
  const preferred: Soundscape =
    room.category === 'A' ? 'lluvia' : room.category === 'C' ? 'olas' : 'ruido_blanco';
  const allowed = rulesFor(room.category, room.protocol).soundscapes;
  return allowed.includes(preferred) ? preferred : (allowed[0] ?? 'silencio');
}

function planNoise(ctx: PolicyContext, b: CallBuilder): void {
  const { event, state } = ctx;
  const room = state.rooms[str(event.payload.room) ?? ''];
  if (!room || !room.occupied) return;
  const db = num(event.payload.db) ?? 70;
  const resting = phaseAt(state.clock.nowMin) === 'night' || room.protocol === 'noche';
  if (!room.auto) {
    b.add(
      'notify_staff',
      { room: room.id, message: t('policy.noiseNotice', { db, room: room.id }), urgency: 'baja' },
      PRIORITY.SLEEP,
      t('reason.autoOffNotifyOnly', { type: t('event.noise') }),
    );
    return;
  }
  if (resting) {
    b.add(
      'set_sound',
      {
        room: room.id,
        soundscape: maskingSoundscape(room),
        pct: 10,
        durationMin: 15,
        restoreOnEnd: true,
      },
      PRIORITY.SLEEP,
      t('reason.noiseNight', { db }),
    );
    b.add(
      'notify_staff',
      { room: room.id, message: t('policy.noiseNotice', { db, room: room.id }), urgency: 'baja' },
      PRIORITY.SLEEP,
      t('reason.noiseNight', { db }),
    );
    return;
  }
  const sensitive = room.category === 'A' || (room.patientForm?.noiseSensitivity ?? 0) >= 7;
  if (sensitive) {
    b.add(
      'apply_protocol',
      { room: room.id, protocol: 'calma', durationMin: 15, restoreOnEnd: true },
      PRIORITY.THERAPEUTIC,
      t('reason.noiseSensitive', { db, category: categoryText(room) }),
    );
  } else {
    b.add(
      'set_sound',
      {
        room: room.id,
        soundscape: maskingSoundscape(room),
        pct: 15,
        durationMin: 10,
        restoreOnEnd: true,
      },
      PRIORITY.THERAPEUTIC,
      t('reason.noiseDay', { db }),
    );
  }
  if (db >= 80) {
    b.add(
      'notify_staff',
      { room: room.id, message: t('policy.noiseNotice', { db, room: room.id }), urgency: 'media' },
      PRIORITY.THERAPEUTIC,
      t('reason.noiseDay', { db }),
    );
  }
}

function planManual(ctx: PolicyContext, b: CallBuilder): void {
  const { event, state } = ctx;
  const action = str(event.payload.action);
  const room = state.rooms[str(event.payload.room) ?? ''];
  if (!room) return;
  if (action === 'simulateCura') {
    const durationMin = num(event.payload.durationMin) ?? 15;
    b.add(
      'apply_protocol',
      { room: room.id, protocol: 'cura', durationMin, restoreOnEnd: true },
      PRIORITY.MANUAL,
      t('reason.curaStaff', { min: durationMin }),
    );
    b.add(
      'notify_staff',
      { room: room.id, message: t('policy.curaStarted', { room: room.id }), urgency: 'baja' },
      PRIORITY.MANUAL,
      t('reason.curaStaff', { min: durationMin }),
    );
    b.add(
      'speak',
      { text: t('policy.curaSpeak'), room: room.id },
      PRIORITY.MANUAL,
      t('reason.announce'),
    );
    return;
  }
  if (action === 'simulateAlarm') {
    const reason = t('reason.safety');
    b.add(
      'set_light',
      { room: room.id, pct: 100, kelvin: 4000, durationMin: 10, restoreOnEnd: true },
      PRIORITY.SAFETY,
      reason,
    );
    b.add('set_sound', { room: room.id, pct: 0, soundscape: 'silencio' }, PRIORITY.SAFETY, reason);
    b.add('set_aroma', { room: room.id, on: false }, PRIORITY.SAFETY, reason);
    b.add(
      'notify_staff',
      { room: room.id, message: t('policy.alarm', { room: room.id }), urgency: 'alta' },
      PRIORITY.SAFETY,
      reason,
    );
    return;
  }
  // Al reactivar el Modo IA o ingresar un paciente, la sala recibe el protocolo de la hora.
  if ((action === 'reevaluate' || action === 'admitted') && room.occupied && room.auto) {
    planCircadian(state, room, b, {
      skipIfSame: false,
      reason: t(action === 'admitted' ? 'reason.admission' : 'reason.reevaluate'),
    });
  }
}

function planVoice(ctx: PolicyContext, b: CallBuilder): void {
  const { event, state } = ctx;
  const text = str(event.payload.text) ?? '';
  const result = interpret(text, {
    selectedRoom: state.ui.selectedRoom,
    triggers: state.triggers,
    occupiedRooms: occupiedRoomIds(state),
  });
  const reason = t('reason.voice', { text });
  if (result.clarification) {
    b.add('speak', { text: result.clarification }, PRIORITY.MANUAL, t('reason.clarify'));
    return;
  }
  for (const call of result.calls) b.add(call.name, call.args, PRIORITY.MANUAL, reason);
}

const SOURCE_BY_KIND: Record<AgentEvent['kind'], ToolSource> = {
  trigger: 'trigger',
  voice: 'voice',
  noise: 'agent',
  timeChange: 'agent',
  manual: 'agent',
};

export function planForEvent(ctx: PolicyContext): ToolCall[] {
  const b = new CallBuilder(ctx.event, SOURCE_BY_KIND[ctx.event.kind]);
  switch (ctx.event.kind) {
    case 'trigger':
      planTrigger(ctx, b);
      break;
    case 'timeChange':
      planTimeChange(ctx, b);
      break;
    case 'noise':
      planNoise(ctx, b);
      break;
    case 'manual':
      planManual(ctx, b);
      break;
    case 'voice':
      planVoice(ctx, b);
      break;
  }
  return b.calls;
}

/** Prioridad que corresponde a cada evento (la usa también el LlmPlanner: el LLM no la elige). */
export function priorityForEvent(event: AgentEvent, state: AppState): PriorityLevel {
  switch (event.kind) {
    case 'voice':
      return PRIORITY.MANUAL;
    case 'trigger': {
      const type = str(event.payload.type) as TriggerType | null;
      return type && type in TRIGGER_PROFILES
        ? TRIGGER_PROFILES[type].priority
        : PRIORITY.PROCEDURE;
    }
    case 'noise':
    case 'timeChange':
      return phaseAt(state.clock.nowMin) === 'night' ? PRIORITY.SLEEP : PRIORITY.THERAPEUTIC;
    case 'manual':
      return str(event.payload.action) === 'simulateCura' ? PRIORITY.MANUAL : PRIORITY.THERAPEUTIC;
  }
}

/** Eventos de seguridad: nunca se delegan a un LLM. */
export function isDeterministicOnly(event: AgentEvent): boolean {
  return event.kind === 'manual' && str(event.payload.action) === 'simulateAlarm';
}

/**
 * Eventos que atiende el agente de IA: solo las órdenes de voz o texto. Los disparadores,
 * el reloj, el ruido y las alarmas los resuelve siempre el motor local: son frecuentes,
 * deben ser instantáneos y reproducibles, y no dependen de la red.
 */
export function isLlmEvent(event: AgentEvent): boolean {
  return event.kind === 'voice' && !isDeterministicOnly(event);
}
