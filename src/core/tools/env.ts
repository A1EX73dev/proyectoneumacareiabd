import { t } from '../../i18n';
import { defaultDurationFor, isOverrideActive } from '../policy/priorities';
import { enforceRules } from '../policy/protocols';
import { patchRoom, withLog } from '../state';
import { formatHHmm } from '../time';
import { PRIORITY, type EnvValues, type Override, type ProtocolId, type Room } from '../types';
import type { ToolContext } from './types';

export interface EnvChangeOptions {
  label: string;
  protocol?: ProtocolId;
  durationMin?: number;
  restoreOnEnd?: boolean;
}

export interface EnvChangeOutcome {
  values: EnvValues;
  adjusted: string[];
  endsAt: string | null;
  autoDisabled: boolean;
}

export function getRoom(ctx: ToolContext, roomId: string): Room {
  const room = ctx.store.getState().rooms[roomId];
  if (!room) throw new Error(t('error.roomNotFound', { room: roomId }));
  return room;
}

/**
 * Único camino para mover actuadores. Calcula el nuevo objetivo a partir del objetivo
 * vigente, aplica reglas (rangos, categoría, alergia), gestiona el override con su
 * prioridad y punto de retorno, y deja el cambio como rampa (o instantáneo si es seguridad).
 * La comprobación de prioridad ya la ha hecho `runTool` antes de llegar aquí.
 */
export function applyEnvChange(
  ctx: ToolContext,
  roomId: string,
  compute: (base: EnvValues, room: Room) => EnvValues,
  opts: EnvChangeOptions,
): EnvChangeOutcome {
  const room = getRoom(ctx, roomId);
  const now = ctx.nowMin;
  const base = room.target ?? room.values;
  const protocol = opts.protocol ?? room.protocol;
  const { values, adjusted } = enforceRules(compute(base, room), {
    category: room.category,
    protocol,
    form: room.patientForm,
    priority: ctx.priority,
  });

  let override: Override;
  if (isOverrideActive(room.override, now) && room.override.eventId === ctx.eventId) {
    // Misma orden/evento: se conserva el override (y su punto de retorno).
    override = room.override;
  } else {
    const duration = opts.durationMin ?? defaultDurationFor(ctx.priority);
    const active = isOverrideActive(room.override, now) ? room.override : null;
    override = {
      priority: ctx.priority,
      source: ctx.source,
      label: opts.label,
      eventId: ctx.eventId,
      startMin: now,
      endMin: duration === null ? null : now + duration,
      restore: opts.restoreOnEnd
        ? { protocol: room.protocol, values: base, override: active }
        : null,
    };
  }

  const autoDisabled =
    ctx.priority === PRIORITY.MANUAL &&
    (ctx.source === 'manual' || ctx.source === 'voice') &&
    room.auto;
  const instant = ctx.priority === PRIORITY.SAFETY;

  let next: Room = { ...room, protocol, override, auto: autoDisabled ? false : room.auto };
  next = instant ? { ...next, values, target: null } : { ...next, target: values };
  if (autoDisabled) {
    next = withLog(next, {
      atMin: now,
      action: t('log.autoDisabled'),
      reason: t('reason.manualAdjust'),
      priority: PRIORITY.MANUAL,
      source: ctx.source,
      ok: true,
    });
  }
  ctx.store.setState((s) => patchRoom(s, roomId, () => next));

  return {
    values,
    adjusted,
    endsAt: override.endMin === null ? null : formatHHmm(override.endMin),
    autoDisabled,
  };
}
