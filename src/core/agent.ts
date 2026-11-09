import { t, tk } from '../i18n';
import { newId } from './ids';
import type { Planner } from './planners/types';
import { pushCall, pushUserUtterance, type AppState, type AppStore } from './state';
import { runTool } from './tools';
import {
  PRIORITY,
  type AgentEvent,
  type AgentEventKind,
  type PlannerKind,
  type ToolCall,
  type ToolResult,
} from './types';

/**
 * Bucle del agente: evento → planner (Mock o LLM con caída al Mock) → llamadas a funciones
 * → ejecución con `runTool` → confirmación. Es la única puerta del agente al estado.
 */

export interface AgentRun {
  event: AgentEvent;
  planner: PlannerKind;
  fellBack: boolean;
  calls: ToolCall[];
  results: ToolResult[];
  reply: string | null;
}

export interface Agent {
  handle(event: AgentEvent): Promise<AgentRun>;
}

export interface AgentOptions {
  store: AppStore;
  mock: Planner;
  llm: Planner;
}

export function makeEvent(
  kind: AgentEventKind,
  payload: Record<string, unknown>,
  at: number,
): AgentEvent {
  return { id: newId(`ev-${kind}`), kind, payload, at };
}

/** Intenta el planner principal; si lanza o devuelve algo inválido, usa el de respaldo. */
export async function planWithFallback(
  primary: Planner,
  fallback: Planner,
  ctx: Parameters<Planner['plan']>[0],
  onFallback: (error: Error) => void,
): Promise<{ calls: ToolCall[]; fellBack: boolean }> {
  try {
    return { calls: await primary.plan(ctx), fellBack: false };
  } catch (e) {
    onFallback(e instanceof Error ? e : new Error(String(e)));
    return { calls: await fallback.plan(ctx), fellBack: true };
  }
}

function roomValues(state: AppState, roomId: unknown) {
  const room = typeof roomId === 'string' ? state.rooms[roomId] : undefined;
  return room ? (room.target ?? room.values) : null;
}

/** Frase de confirmación de una llamada ya ejecutada. */
export function describeOutcome(state: AppState, call: ToolCall, result: ToolResult): string {
  if (!result.ok) return t('reply.failed', { action: tk('tool', call.name), error: result.error });
  const a = call.args;
  const room = String(a.room ?? '');
  const v = roomValues(state, a.room);
  switch (call.name) {
    case 'set_temperature':
      return t('reply.temperature', { room, value: v?.tempC ?? '—' });
    case 'set_light':
      return t('reply.light', { room, pct: v?.lightPct ?? '—', kelvin: v?.kelvin ?? '—' });
    case 'set_sound':
      return t('reply.sound', {
        room,
        pct: v?.soundPct ?? '—',
        soundscape: tk('soundscape', v?.soundscape ?? 'silencio'),
      });
    case 'set_aroma':
      return a.on ? t('reply.aromaOn', { room }) : t('reply.aromaOff', { room });
    case 'apply_protocol':
      return t('reply.protocol', { room, protocol: tk('protocol', String(a.protocol)) });
    case 'set_auto_mode':
      return a.on ? t('reply.autoOn', { room }) : t('reply.autoOff', { room });
    case 'open_room':
      return t('reply.openRoom', { room });
    case 'get_room_state': {
      const r = state.rooms[room];
      if (!r) return t('reply.done', { action: tk('tool', call.name) });
      return t('reply.state', {
        room,
        protocol: tk('protocol', r.protocol),
        temp: Math.round(r.values.tempC * 10) / 10,
        light: Math.round(r.values.lightPct),
        kelvin: Math.round(r.values.kelvin),
        sound: Math.round(r.values.soundPct),
        auto: r.auto ? t('common.on') : t('common.off'),
      });
    }
    case 'schedule_trigger':
      return t('reply.scheduled', {
        type: tk('trigger', String(a.type ?? '')),
        time: String(a.time ?? ''),
        room: a.room && a.room !== 'all' ? String(a.room) : t('common.allFloor'),
      });
    case 'cancel_trigger':
      return t('reply.cancelled');
    case 'notify_staff':
      return t('reply.notified');
    default:
      return t('reply.done', { action: tk('tool', call.name) });
  }
}

export function composeReply(
  state: AppState,
  calls: ToolCall[],
  results: ToolResult[],
): string | null {
  const relevant = calls
    .map((call, i) => ({ call, result: results[i] }))
    .filter(
      (x): x is { call: ToolCall; result: ToolResult } => !!x.result && x.call.name !== 'speak',
    );
  if (relevant.length === 0) return null;
  // Varias llamadas iguales (p. ej. Modo IA en todas las salas) se resumen en una frase.
  if (relevant.length > 3) return t('reply.many', { count: relevant.length });
  return relevant.map((x) => describeOutcome(state, x.call, x.result)).join(' ');
}

export function createAgent({ store, mock, llm }: AgentOptions): Agent {
  const agent: Agent = {
    async handle(event) {
      store.setState((s) => {
        const next = { ...s, agent: { ...s.agent, lastEvent: event } };
        return event.kind === 'voice'
          ? pushUserUtterance(next, String(event.payload.text ?? ''))
          : next;
      });

      const state = store.getState();
      const ctx = { event, state, nowMin: state.clock.nowMin };
      let planner: PlannerKind = state.agent.plannerKind;
      let calls: ToolCall[];
      let fellBack = false;

      if (planner === 'llm') {
        const planned = await planWithFallback(llm, mock, ctx, (error) => {
          store.setState((s) => {
            const next = pushCall(s, {
              id: newId('call'),
              atMin: s.clock.nowMin,
              call: {
                id: newId('fb'),
                name: 'planner_fallback',
                args: { from: 'llm', to: 'mock', event: event.kind },
                eventId: event.id,
                source: 'system',
                reason: t('agent.fallback'),
              },
              result: { ok: false, error: error.message },
            });
            return { ...next, agent: { ...next.agent, fallbacks: next.agent.fallbacks + 1 } };
          });
        });
        calls = planned.calls;
        fellBack = planned.fellBack;
        if (fellBack) planner = 'mock';
      } else {
        calls = await mock.plan(ctx);
      }

      const results = calls.map((call) => runTool(call, store));

      let reply: string | null = null;
      if (event.kind === 'voice') {
        reply = composeReply(store.getState(), calls, results);
        if (reply) {
          runTool(
            {
              id: newId('say'),
              name: 'speak',
              args: { text: reply },
              priority: PRIORITY.MANUAL,
              source: 'agent',
              eventId: event.id,
              reason: t('reason.confirmation'),
            },
            store,
          );
        }
      }

      // Al reactivar el Modo IA, el agente reevalúa la sala para devolverla a su protocolo.
      for (let i = 0; i < calls.length; i += 1) {
        const call = calls[i];
        if (call?.name === 'set_auto_mode' && call.args.on === true && results[i]?.ok) {
          await agent.handle(
            makeEvent(
              'manual',
              { action: 'reevaluate', room: call.args.room },
              store.getState().clock.nowMin,
            ),
          );
        }
      }

      return { event, planner, fellBack, calls, results, reply };
    },
  };
  return agent;
}
