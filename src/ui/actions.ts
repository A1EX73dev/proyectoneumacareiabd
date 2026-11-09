import { makeEvent, type AgentRun } from '../core/agent';
import { newId } from '../core/ids';
import { TRIGGER_PROFILES } from '../core/policy/triggerProfiles';
import { agent, engine } from '../core/runtime';
import {
  appStore,
  setLanguage,
  setPlannerKind,
  setSpeed,
  setView,
  simulateNoiseSpike,
} from '../core/state';
import { runTool } from '../core/tools';
import {
  PRIORITY,
  type AgentEventKind,
  type PlannerKind,
  type SimSpeed,
  type ToolResult,
  type TriggerType,
} from '../core/types';
import { t, type Lang } from '../i18n';

/**
 * Acciones de la interfaz. Todo lo que cambia el entorno pasa por las funciones del
 * agente (`runTool`) con prioridad de orden manual, o se emite como evento al agente.
 * La navegación, el idioma y el reloj son estado de la interfaz y se cambian directamente.
 */

export function manual(name: string, args: Record<string, unknown>, reason?: string): ToolResult {
  return runTool({
    id: newId('ui'),
    name,
    args,
    priority: PRIORITY.MANUAL,
    source: 'manual',
    reason: reason ?? t('reason.manualUi'),
  });
}

export function emit(kind: AgentEventKind, payload: Record<string, unknown>): Promise<AgentRun> {
  return agent.handle(makeEvent(kind, payload, appStore.getState().clock.nowMin));
}

export function setAuto(room: string, on: boolean): ToolResult {
  const result = manual('set_auto_mode', { room, on });
  if (result.ok && on) void emit('manual', { action: 'reevaluate', room });
  return result;
}

export function sendUtterance(text: string): Promise<AgentRun> {
  return emit('voice', { text });
}

export function openRoomView(room: string): void {
  appStore.setState((s) => setView(s, 'room', room));
}

export function backToMap(): void {
  appStore.setState((s) => setView(s, 'map'));
}

export function changeSpeed(speed: SimSpeed): void {
  appStore.setState((s) => setSpeed(s, speed));
}

export function changeLang(lang: Lang): void {
  appStore.setState((s) => setLanguage(s, lang));
}

export function changePlanner(kind: PlannerKind): void {
  appStore.setState((s) => setPlannerKind(s, kind));
}

export function jumpTo(hhmm: string): Promise<void> {
  return engine.jumpTo(hhmm);
}

export const NOISE_SPIKE_DB = 78;

export function simulateNoise(room: string): Promise<AgentRun> {
  appStore.setState((s) => simulateNoiseSpike(s, room, NOISE_SPIKE_DB));
  return emit('noise', { room, db: NOISE_SPIKE_DB });
}

export function simulateCura(room: string, durationMin = 15): Promise<AgentRun> {
  return emit('manual', { action: 'simulateCura', room, durationMin });
}

export function simulateAlarm(room: string): Promise<AgentRun> {
  return emit('manual', { action: 'simulateAlarm', room });
}

export function fireNow(type: TriggerType, roomId: string | 'all'): Promise<AgentRun> {
  return emit('trigger', {
    type,
    roomId,
    durationMin: TRIGGER_PROFILES[type].defaultDuration,
    manualFire: true,
  });
}
