import { createStore, type StoreApi } from 'zustand/vanilla';
import { setLang, t, type Lang } from '../i18n';
import { classifier, SAMPLE_FORMS } from './classify';
import { daylight } from './color';
import { newId } from './ids';
import { patientFlags, phaseProtocol, resolveProtocol } from './policy/protocols';
import { defaultTriggers } from './policy/triggerProfiles';
import { hourOf, phaseAt } from './time';
import {
  NUMERIC_ENV_KEYS,
  ROOM_IDS,
  type AgentEvent,
  type CallRecord,
  type CategoryId,
  type ConversationItem,
  type EnvValues,
  type LogEntry,
  type NumericEnvKey,
  type PlannerKind,
  type Room,
  type SimSpeed,
  type SpeechItem,
  type StaffNotification,
  type Trigger,
} from './types';

/* ------------------------------------------------------------------ */
/* Forma del estado (solo en memoria, sin persist)                     */
/* ------------------------------------------------------------------ */

export interface ClockSlice {
  nowMin: number;
  speed: SimSpeed;
}

export interface UiSlice {
  view: 'map' | 'room';
  selectedRoom: string | null;
  lang: Lang;
}

export interface AgentSlice {
  plannerKind: PlannerKind;
  lastEvent: AgentEvent | null;
  calls: CallRecord[];
  notifications: StaffNotification[];
  speech: SpeechItem[];
  conversation: ConversationItem[];
  fallbacks: number;
}

export interface AppState {
  rooms: Record<string, Room>;
  roomIds: string[];
  triggers: Trigger[];
  clock: ClockSlice;
  ui: UiSlice;
  agent: AgentSlice;
}

export type AppStore = StoreApi<AppState>;

export const LOG_CAP = 150;
export const CALL_CAP = 120;
export const LIST_CAP = 60;
/** Fracción de la distancia restante que recorre cada paso de rampa. */
export const RAMP_FACTOR = 0.15;
/** Hora de inicio de la simulación: día 0, 08:20. */
export const DEFAULT_START_MIN = 8 * 60 + 20;

const OCCUPIED_BY_DEFAULT = new Set(['201', '202', '203', '205', '206', '208', '209']);
const SEEDED: Record<string, CategoryId> = { '201': 'A', '203': 'B', '205': 'C' };

/* ------------------------------------------------------------------ */
/* Lecturas simuladas                                                   */
/* ------------------------------------------------------------------ */

export function baseNoiseDb(values: EnvValues): number {
  return 28 + (values.soundscape === 'silencio' ? 0 : values.soundPct * 0.35);
}

export function luxFor(values: EnvValues, nowMin: number): number {
  return values.lightPct * 3 + daylight(hourOf(nowMin)) * 150;
}

/* ------------------------------------------------------------------ */
/* Creación                                                            */
/* ------------------------------------------------------------------ */

export function makeRoom(id: string, occupied: boolean, nowMin: number): Room {
  const protocol = occupied ? phaseProtocol(phaseAt(nowMin), null) : 'neutro';
  const values = occupied
    ? resolveProtocol(protocol, null, null)
    : { ...resolveProtocol('neutro', null, null), lightPct: 0, soundPct: 0 };
  return {
    id,
    occupied,
    patientForm: null,
    category: null,
    classification: null,
    protocol,
    auto: occupied,
    override: null,
    values,
    target: null,
    readings: {
      tempC: values.tempC - 0.4,
      noiseDb: baseNoiseDb(values),
      lux: luxFor(values, nowMin),
    },
    noiseSpike: 0,
    log: [],
  };
}

export interface InitialStateOptions {
  nowMin?: number;
  seedPatients?: boolean;
  triggers?: Trigger[];
  occupied?: string[];
}

export function createInitialState(opts: InitialStateOptions = {}): AppState {
  const nowMin = opts.nowMin ?? DEFAULT_START_MIN;
  const occupied = new Set(opts.occupied ?? OCCUPIED_BY_DEFAULT);
  const rooms: Record<string, Room> = {};
  for (const id of ROOM_IDS) {
    let room = makeRoom(id, occupied.has(id), nowMin);
    const seed = SEEDED[id];
    if (opts.seedPatients && seed && room.occupied) {
      const form = SAMPLE_FORMS[seed];
      const classification = classifier.classify(form);
      const protocol = phaseProtocol(phaseAt(nowMin), classification.category);
      const values = resolveProtocol(protocol, classification.category, form);
      room = {
        ...room,
        patientForm: form,
        category: classification.category,
        classification,
        protocol,
        values,
        readings: { ...room.readings, tempC: values.tempC - 0.4, noiseDb: baseNoiseDb(values) },
      };
    }
    rooms[id] = room;
  }
  return {
    rooms,
    roomIds: [...ROOM_IDS],
    triggers: opts.triggers ?? defaultTriggers(),
    clock: { nowMin, speed: 1 },
    ui: { view: 'map', selectedRoom: null, lang: 'es' },
    agent: {
      plannerKind: 'mock',
      lastEvent: null,
      calls: [],
      notifications: [],
      speech: [],
      conversation: [],
      fallbacks: 0,
    },
  };
}

export function createAppStore(initial: AppState = createInitialState()): AppStore {
  return createStore<AppState>()(() => initial);
}

/** Store único de la aplicación (en memoria; se pierde al recargar la página). */
export const appStore: AppStore = createAppStore(createInitialState({ seedPatients: true }));

/* ------------------------------------------------------------------ */
/* Acciones puras: (estado, …) → estado                                 */
/* ------------------------------------------------------------------ */

export function patchRoom(state: AppState, id: string, fn: (room: Room) => Room): AppState {
  const room = state.rooms[id];
  if (!room) return state;
  return { ...state, rooms: { ...state.rooms, [id]: fn(room) } };
}

export function withLog(room: Room, entry: Omit<LogEntry, 'id'>): Room {
  return { ...room, log: [{ id: newId('log'), ...entry }, ...room.log].slice(0, LOG_CAP) };
}

export function pushCall(state: AppState, record: CallRecord): AppState {
  return {
    ...state,
    agent: { ...state.agent, calls: [record, ...state.agent.calls].slice(0, CALL_CAP) },
  };
}

export function pushNotification(state: AppState, n: StaffNotification): AppState {
  return {
    ...state,
    agent: { ...state.agent, notifications: [n, ...state.agent.notifications].slice(0, LIST_CAP) },
  };
}

export function pushSpeech(state: AppState, text: string): AppState {
  const atMin = state.clock.nowMin;
  const speech: SpeechItem = { id: newId('sp'), atMin, text };
  const said: ConversationItem = { id: newId('cv'), atMin, who: 'agent', text };
  return {
    ...state,
    agent: {
      ...state.agent,
      speech: [...state.agent.speech, speech].slice(-LIST_CAP),
      conversation: [...state.agent.conversation, said].slice(-LIST_CAP),
    },
  };
}

export function pushUserUtterance(state: AppState, text: string): AppState {
  const item: ConversationItem = { id: newId('cv'), atMin: state.clock.nowMin, who: 'user', text };
  return {
    ...state,
    agent: { ...state.agent, conversation: [...state.agent.conversation, item].slice(-LIST_CAP) },
  };
}

/** Bloqueo de aroma por alergia: se aplica a cualquier valor que vaya a un actuador. */
export function enforceAllergy(room: Room, values: EnvValues): EnvValues {
  if (!patientFlags(room.patientForm).aromaBlocked) return values;
  return { ...values, aromaOn: false, aromaPct: 0 };
}

export function setRoomTarget(room: Room, values: EnvValues, instant: boolean): Room {
  const safe = enforceAllergy(room, values);
  return instant ? { ...room, values: safe, target: null } : { ...room, target: safe };
}

const EPS: Record<NumericEnvKey, number> = {
  tempC: 0.05,
  lightPct: 0.5,
  kelvin: 15,
  soundPct: 0.5,
  aromaPct: 0.5,
};

/** Pasos de rampa por tick: 1 a 1×; varios a velocidades altas para que dure ~1–3 min simulados. */
export function rampSteps(speed: SimSpeed): number {
  return speed <= 1 ? 1 : Math.min(30, Math.ceil(speed / 4));
}

/** Avanza `steps` pasos de rampa (15 % de la distancia restante por paso). Nunca salta. */
export function rampValues(
  values: EnvValues,
  target: EnvValues,
  steps: number,
): { values: EnvValues; done: boolean } {
  const k = 1 - Math.pow(1 - RAMP_FACTOR, Math.max(1, steps));
  const next: EnvValues = {
    ...values,
    soundscape: target.soundscape,
    aromaType: target.aromaType,
    aromaOn: target.aromaOn,
  };
  let done = true;
  for (const key of NUMERIC_ENV_KEYS) {
    const goal = target[key];
    const moved = values[key] + (goal - values[key]) * k;
    if (Math.abs(goal - moved) <= EPS[key]) {
      next[key] = goal;
    } else {
      next[key] = moved;
      done = false;
    }
  }
  return { values: next, done };
}

/** Cierra los eventos vencidos; si guardaban un punto de retorno, vuelve a él con rampa. */
export function expireOverride(room: Room, nowMin: number): Room {
  let r = room;
  for (let guard = 0; guard < 10; guard += 1) {
    const o = r.override;
    if (!o || o.endMin === null || nowMin < o.endMin) break;
    if (o.restore) {
      r = { ...r, protocol: o.restore.protocol, override: o.restore.override };
      r = setRoomTarget(r, o.restore.values, false);
      r = withLog(r, {
        atMin: nowMin,
        action: t('log.eventEnded', { label: o.label }),
        reason: t('reason.restore'),
        priority: o.priority,
        source: 'system',
        ok: true,
      });
    } else {
      r = withLog(
        { ...r, override: null },
        {
          atMin: nowMin,
          action: t('log.eventEnded', { label: o.label }),
          reason: t('reason.overrideEnded'),
          priority: o.priority,
          source: 'system',
          ok: true,
        },
      );
    }
  }
  return r;
}

export function updateReadings(room: Room, simMin: number, nowMin: number): Room {
  const k = Math.min(1, 0.08 * simMin);
  const noiseSpike = room.noiseSpike * 0.8 < 0.5 ? 0 : room.noiseSpike * 0.8;
  return {
    ...room,
    noiseSpike,
    readings: {
      tempC: room.readings.tempC + (room.values.tempC - room.readings.tempC) * k,
      noiseDb: baseNoiseDb(room.values) + noiseSpike,
      lux: luxFor(room.values, nowMin),
    },
  };
}

/** Un tick de simulación para todas las habitaciones: fin de eventos, rampas y lecturas. */
export function tickRooms(
  state: AppState,
  nowMin: number,
  steps: number,
  simMin: number,
): AppState {
  const rooms: Record<string, Room> = {};
  for (const id of state.roomIds) {
    const current = state.rooms[id];
    if (!current) continue;
    let r = expireOverride(current, nowMin);
    if (r.target) {
      const { values, done } = rampValues(r.values, r.target, steps);
      r = { ...r, values, target: done ? null : r.target };
    }
    rooms[id] = updateReadings(r, simMin, nowMin);
  }
  return { ...state, rooms };
}

export function setSpeed(state: AppState, speed: SimSpeed): AppState {
  return { ...state, clock: { ...state.clock, speed } };
}

export function setView(state: AppState, view: 'map' | 'room', room?: string | null): AppState {
  return {
    ...state,
    ui: { ...state.ui, view, selectedRoom: room === undefined ? state.ui.selectedRoom : room },
  };
}

export function setPlannerKind(state: AppState, plannerKind: PlannerKind): AppState {
  return { ...state, agent: { ...state.agent, plannerKind } };
}

export function setLanguage(state: AppState, lang: Lang): AppState {
  setLang(lang);
  return { ...state, ui: { ...state.ui, lang } };
}

/** Sensor simulado: un pico de ruido que decae solo. */
export function simulateNoiseSpike(state: AppState, roomId: string, db: number): AppState {
  return patchRoom(state, roomId, (r) => ({
    ...r,
    noiseSpike: Math.max(0, db - baseNoiseDb(r.values)),
    readings: { ...r.readings, noiseDb: db },
  }));
}

/** Privacidad: al borrar los datos del paciente se eliminan también de las llamadas registradas. */
export function redactPatientData(state: AppState, roomId: string): AppState {
  const calls = state.agent.calls.map((rec) =>
    rec.call.name === 'classify_patient' && rec.call.args.room === roomId
      ? {
          ...rec,
          call: { ...rec.call, args: { room: roomId, form: t('privacy.redacted') } },
          result: rec.result.ok ? { ok: true as const, result: t('privacy.redacted') } : rec.result,
        }
      : rec,
  );
  return { ...state, agent: { ...state.agent, calls } };
}

export function occupiedRoomIds(state: AppState): string[] {
  return state.roomIds.filter((id) => state.rooms[id]?.occupied);
}
