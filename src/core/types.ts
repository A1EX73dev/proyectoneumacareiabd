/**
 * Tipos del dominio. Todo vive en memoria: no hay persistencia de ningún dato.
 */

export const ROOM_IDS = [
  '201',
  '202',
  '203',
  '204',
  '205',
  '206',
  '207',
  '208',
  '209',
  '210',
] as const;

export const PROTOCOL_IDS = [
  'noche',
  'calma',
  'manana',
  'comida',
  'medicacion',
  'cura',
  'visita',
  'neutro',
] as const;
export type ProtocolId = (typeof PROTOCOL_IDS)[number];

export const CATEGORY_IDS = ['A', 'B', 'C'] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

export const SOUNDSCAPES = [
  'silencio',
  'lluvia',
  'bosque',
  'olas',
  'pajaros',
  'respiracion',
  'ruido_blanco',
] as const;
export type Soundscape = (typeof SOUNDSCAPES)[number];

export const AROMA_TYPES = ['lavanda', 'citrico', 'eucalipto'] as const;
export type AromaType = (typeof AROMA_TYPES)[number];

export const TRIGGER_TYPES = [
  'desayuno',
  'comida',
  'merienda',
  'cena',
  'medicacion',
  'cura',
  'visita',
  'descanso',
  'despertar',
  'constantes',
] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const ADMISSION_REASONS = [
  'cirugia',
  'traumatologia',
  'respiratorio',
  'cardiologia',
  'oncologia',
  'neurologia',
  'medicina_interna',
  'otro',
] as const;
export type AdmissionReason = (typeof ADMISSION_REASONS)[number];

export const MOBILITY_LEVELS = ['autonomo', 'asistido', 'encamado'] as const;
export type Mobility = (typeof MOBILITY_LEVELS)[number];

export const RISK_LEVELS = ['bajo', 'medio', 'alto'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const URGENCY_LEVELS = ['baja', 'media', 'alta'] as const;
export type Urgency = (typeof URGENCY_LEVELS)[number];

/** Posiciones con nombre del respaldo de la cama: estirada, semiincorporada e incorporada. */
export const BED_POSITIONS = ['plana', 'semi', 'incorporada'] as const;
export type BedPosition = (typeof BED_POSITIONS)[number];

/**
 * Lesión o indicación del paciente que limita cuánto puede moverse el respaldo de la cama.
 * Los límites de cada una están en `policy/bed.ts`.
 */
export const BED_RESTRICTIONS = [
  'ninguna',
  'columna',
  'cadera',
  'respiratoria',
  'craneal',
] as const;
export type BedRestriction = (typeof BED_RESTRICTIONS)[number];

/**
 * Jerarquía de prioridades: un número menor es MÁS prioritario.
 * Una prioridad menor (número mayor) nunca anula a una mayor.
 */
export const PRIORITY = {
  SAFETY: 1,
  MANUAL: 2,
  PROCEDURE: 3,
  SLEEP: 4,
  THERAPEUTIC: 5,
  NEUTRAL: 6,
} as const;
export type PriorityLevel = (typeof PRIORITY)[keyof typeof PRIORITY];
export const PRIORITY_LEVELS: PriorityLevel[] = [1, 2, 3, 4, 5, 6];

export type ToolSource = 'manual' | 'voice' | 'trigger' | 'agent' | 'llm' | 'system';
export type SimSpeed = 0 | 1 | 60 | 600;
export const SIM_SPEEDS: SimSpeed[] = [0, 1, 60, 600];
export type PlannerKind = 'mock' | 'llm';

export interface EnvValues {
  tempC: number;
  lightPct: number;
  kelvin: number;
  /** Apertura de la persiana eléctrica: 0 = bajada del todo, 100 = subida del todo. */
  blindsPct: number;
  soundPct: number;
  soundscape: Soundscape;
  aromaOn: boolean;
  aromaPct: number;
  aromaType: AromaType;
}

export type NumericEnvKey =
  'tempC' | 'lightPct' | 'kelvin' | 'blindsPct' | 'soundPct' | 'aromaPct';
export const NUMERIC_ENV_KEYS: NumericEnvKey[] = [
  'tempC',
  'lightPct',
  'kelvin',
  'blindsPct',
  'soundPct',
  'aromaPct',
];
export type Range = readonly [number, number];
export type Ranges = Record<NumericEnvKey, Range>;

/** Estado al que se vuelve gradualmente cuando termina un evento. */
export interface RestorePoint {
  protocol: ProtocolId;
  values: EnvValues;
  override: Override | null;
}

/** Evento que controla la sala en este momento (con su prioridad y su fin). */
export interface Override {
  priority: PriorityLevel;
  source: ToolSource;
  label: string;
  eventId: string;
  startMin: number;
  endMin: number | null;
  restore: RestorePoint | null;
}

export interface LogEntry {
  id: string;
  atMin: number;
  action: string;
  reason: string;
  priority: PriorityLevel;
  source: ToolSource;
  ok: boolean;
  detail?: string;
}

export interface Readings {
  tempC: number;
  noiseDb: number;
  lux: number;
}

export interface PatientForm {
  /** Nombre o identificador para reconocer al paciente en el panel; puede ir vacío. */
  name: string;
  age: number;
  admissionReason: AdmissionReason;
  anxiety: number;
  sleepQuality: number;
  noiseSensitivity: number;
  lightSensitivity: number;
  mobility: Mobility;
  deliriumRisk: RiskLevel;
  /** Lesión que limita el movimiento del respaldo de la cama. */
  bedRestriction: BedRestriction;
  aromaAllergy: boolean;
  aromaAllergyText: string;
  preferences: string;
  wantsAroma: boolean;
}

export interface Contribution {
  category: CategoryId;
  feature: string;
  weight: number;
  value: number;
  points: number;
}

export interface CategoryParams {
  aromaBlocked: boolean;
  aromaAllowed: AromaType | null;
  preferredSoundscape: Soundscape;
  circadian: 'suave' | 'marcado' | 'activador';
  ranges: Record<ProtocolId, Ranges>;
}

export interface ClassificationResult {
  category: CategoryId;
  confidence: number;
  rationale: string[];
  params: CategoryParams;
  scores: Record<CategoryId, number>;
  contributions: Contribution[];
  rule: string | null;
}

/**
 * Cama articulada. No forma parte de `EnvValues` a propósito: los protocolos y los
 * disparadores nunca la mueven; solo cambia con una orden explícita (`set_bed`).
 */
export interface BedState {
  /** Ángulo actual del respaldo en grados (0 = plana). */
  backrestDeg: number;
  /** Ángulo pedido; null si la cama ya ha llegado. */
  targetDeg: number | null;
}

export interface Room {
  id: string;
  occupied: boolean;
  patientForm: PatientForm | null;
  category: CategoryId | null;
  classification: ClassificationResult | null;
  protocol: ProtocolId;
  auto: boolean;
  override: Override | null;
  values: EnvValues;
  target: EnvValues | null;
  bed: BedState;
  readings: Readings;
  noiseSpike: number;
  log: LogEntry[];
}

export interface Trigger {
  id: string;
  type: TriggerType;
  roomId: string | 'all';
  time: string;
  repeat: 'daily' | 'once';
  durationMin: number;
  enabled: boolean;
  params: Record<string, string | number | boolean>;
  lastFiredKey: string | null;
}

export type AgentEventKind = 'trigger' | 'voice' | 'noise' | 'timeChange' | 'manual';

export interface AgentEvent {
  id: string;
  kind: AgentEventKind;
  payload: Record<string, unknown>;
  at: number;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  /** La asigna el planner a partir del evento, nunca el LLM. */
  priority?: PriorityLevel;
  reason?: string;
  eventId?: string;
  source?: ToolSource;
}

export type ToolResult = { ok: true; result: unknown } | { ok: false; error: string };

export interface CallRecord {
  id: string;
  atMin: number;
  call: ToolCall;
  result: ToolResult;
}

export interface StaffNotification {
  id: string;
  atMin: number;
  room: string | null;
  message: string;
  urgency: Urgency;
}

export interface ConversationItem {
  id: string;
  atMin: number;
  who: 'user' | 'agent';
  text: string;
}

export interface SpeechItem {
  id: string;
  atMin: number;
  text: string;
}
