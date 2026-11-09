import { makeEvent, type Agent } from './agent';
import { rampSteps, tickRooms, type AppStore } from './state';
import { dayOf, MIN_PER_DAY, parseHHmm, phaseAt } from './time';
import type { AgentEvent, Trigger } from './types';

export * from './time';

/**
 * Reloj simulado y disparadores horarios.
 * Un disparador tiene una ventana [hora, hora + duración). Se dispara una sola vez por
 * ventana gracias a `lastFiredKey` ("día@HH:mm"), aunque el reloj avance a saltos.
 */

export interface DueTrigger {
  trigger: Trigger;
  key: string;
}

/** Disparadores cuya ventana se solapa con el intervalo [prevMin, nowMin] y aún no han disparado. */
export function dueTriggers(triggers: Trigger[], prevMin: number, nowMin: number): DueTrigger[] {
  const due: DueTrigger[] = [];
  const today = dayOf(nowMin);
  for (const trigger of triggers) {
    if (!trigger.enabled) continue;
    const at = parseHHmm(trigger.time);
    // Se mira también el día anterior por si la ventana cruza la medianoche.
    for (const day of [today - 1, today]) {
      const start = day * MIN_PER_DAY + at;
      const end = start + Math.max(1, trigger.durationMin);
      const key = `${day}@${trigger.time}`;
      if (start <= nowMin && end > prevMin && trigger.lastFiredKey !== key) {
        due.push({ trigger, key });
        break;
      }
    }
  }
  return due;
}

export function markFired(triggers: Trigger[], fired: DueTrigger[]): Trigger[] {
  if (fired.length === 0) return triggers;
  const keys = new Map(fired.map((d) => [d.trigger.id, d.key]));
  return triggers.map((tr) => {
    const key = keys.get(tr.id);
    if (!key) return tr;
    return { ...tr, lastFiredKey: key, enabled: tr.repeat === 'once' ? false : tr.enabled };
  });
}

export function triggerEvent(d: DueTrigger, at: number): AgentEvent {
  return makeEvent(
    'trigger',
    {
      triggerId: d.trigger.id,
      type: d.trigger.type,
      roomId: d.trigger.roomId,
      durationMin: d.trigger.durationMin,
      params: d.trigger.params,
      key: d.key,
    },
    at,
  );
}

export interface Engine {
  start(): void;
  stop(): void;
  isRunning(): boolean;
  /** Un tick de `realSeconds` reales (por defecto 1 s). */
  tick(realSeconds?: number): Promise<void>;
  /** Salta a la próxima vez que el reloj marque HH:mm (el tiempo solo avanza). */
  jumpTo(hhmm: string): Promise<void>;
}

export interface EngineOptions {
  store: AppStore;
  agent: Agent;
  intervalMs?: number;
}

export function createEngine({ store, agent, intervalMs = 1000 }: EngineOptions): Engine {
  let timer: ReturnType<typeof setInterval> | null = null;
  let busy = false;

  async function processTime(prev: number, now: number, jumped: boolean): Promise<void> {
    const due = dueTriggers(store.getState().triggers, prev, now);
    if (due.length > 0) store.setState((s) => ({ triggers: markFired(s.triggers, due) }));
    const events: AgentEvent[] = due.map((d) => triggerEvent(d, now));
    if (jumped || phaseAt(prev) !== phaseAt(now)) {
      events.push(
        makeEvent('timeChange', { fromMin: prev, toMin: now, phase: phaseAt(now), jumped }, now),
      );
    }
    for (const event of events) await agent.handle(event);
  }

  async function tick(realSeconds = 1): Promise<void> {
    const before = store.getState();
    const prev = before.clock.nowMin;
    const now = prev + (before.clock.speed * realSeconds) / 60;
    store.setState((s) =>
      tickRooms(
        { ...s, clock: { ...s.clock, nowMin: now } },
        now,
        rampSteps(s.clock.speed),
        now - prev,
      ),
    );
    await processTime(prev, now, false);
  }

  async function jumpTo(hhmm: string): Promise<void> {
    const prev = store.getState().clock.nowMin;
    let target = dayOf(prev) * MIN_PER_DAY + parseHHmm(hhmm);
    if (target <= prev) target += MIN_PER_DAY;
    store.setState((s) =>
      tickRooms({ ...s, clock: { ...s.clock, nowMin: target } }, target, 1, target - prev),
    );
    // En un salto solo cuentan las ventanas que contienen la nueva hora (no las intermedias).
    await processTime(target, target, true);
  }

  return {
    start() {
      if (timer) return;
      timer = setInterval(() => {
        if (busy) return;
        busy = true;
        tick(intervalMs / 1000).finally(() => {
          busy = false;
        });
      }, intervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    isRunning: () => timer !== null,
    tick,
    jumpTo,
  };
}
