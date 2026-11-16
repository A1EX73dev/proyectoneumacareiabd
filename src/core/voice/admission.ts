import { EMPTY_FORM } from '../classify';
import type { AdmissionReason, BedRestriction, Mobility, PatientForm } from '../types';
import { normalize } from './text';

/**
 * Ingreso de pacientes por voz o texto, resuelto SIEMPRE en local: los datos del paciente
 * nunca se envían al agente de IA (ver `isLlmEvent`).
 */

const ADMIT_VERB = /\b(ingresa\w*|ingresar|ingresame|ingresen|admite|admitir|admiteme)\b/;
/** Verbos que solo cuentan como ingreso si la frase habla de un paciente. */
const SOFT_VERB =
  /\b(anade|anadir|anademe|agrega|agregar|registra|registrar|crea|crear|da de alta|dar de alta|mete|meter|aloja|alojar|instala|instalar|hospitaliza\w*)\b/;
const PATIENT_WORD = /\b(paciente|pacientes|enfermo|enferma)\b/;

/** ¿La frase pide ingresar a un paciente? («ingresa a Pedro en la 207», «añade un paciente»…). */
export function isAdmissionUtterance(text: string): boolean {
  const n = normalize(text);
  if (ADMIT_VERB.test(n)) return true;
  return SOFT_VERB.test(n) && PATIENT_WORD.test(n);
}

const REASONS: [RegExp, AdmissionReason][] = [
  [/\b(cirugia|operacion|operado|operada|postoperatorio)\b/, 'cirugia'],
  [/\b(traumatologia|fractura|traumatico)\b/, 'traumatologia'],
  [/\b(respiratori\w*|neumonia|pulmon\w*|disnea|asma|epoc)\b/, 'respiratorio'],
  [/\b(cardiologia|cardiac\w*|corazon|cardio)\b/, 'cardiologia'],
  [/\b(oncologia|oncologic\w*|cancer)\b/, 'oncologia'],
  [/\b(neurologia|neurologico|neurologica|ictus)\b/, 'neurologia'],
  [/\b(medicina interna)\b/, 'medicina_interna'],
];

const BED: [RegExp, BedRestriction][] = [
  [/\b(columna|lumbar|vertebr\w*)\b/, 'columna'],
  [/\b(cadera)\b/, 'cadera'],
  [/\b(craneal|craneo)\b/, 'craneal'],
];

const MOBILITY: [RegExp, Mobility][] = [
  [/\b(encamad[oa]|inmovil\w*)\b/, 'encamado'],
  [/\b(autonom[oa]|independiente)\b/, 'autonomo'],
  [/\b(asistid[oa]|con ayuda)\b/, 'asistido'],
];

/** «ansiedad alta/media/baja» o «ansiedad 8» → 0-10. */
function scale(n: string, word: string): number | null {
  const re = new RegExp(
    `${word}\\s+(muy alt[oa]|alt[oa]|media|medio|moderad[oa]|baj[oa]|nula|\\d{1,2})\\b`,
  );
  const v = re.exec(n)?.[1];
  if (!v) return null;
  if (/^\d/.test(v)) return Math.min(10, Number(v));
  if (v.startsWith('muy')) return 9;
  if (v.startsWith('alt')) return 8;
  if (v.startsWith('baj') || v === 'nula') return 2;
  return 5;
}

const NAME_STOP = new Set([
  'de',
  'del',
  'con',
  'y',
  'e',
  'en',
  'que',
  'tiene',
  'anos',
  'ano',
  'por',
  'para',
  'la',
  'el',
  'habitacion',
  'hab',
  'cuarto',
  'ingresa',
  'motivo',
  'ansiedad',
  'alergico',
  'alergica',
  'es',
  'esta',
  'edad',
  'a',
  'al',
]);

function cleanName(raw: string): string {
  const words: string[] = [];
  for (const w of raw.split(/\s+/)) {
    const key = normalize(w);
    if (!key || /^\d/.test(key) || NAME_STOP.has(key)) {
      if (words.length > 0) break;
      continue;
    }
    words.push(w.replace(/[.,;:¿?¡!"']/g, ''));
    if (words.length === 3) break;
  }
  return words
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .slice(0, 60);
}

const NOT_A_NAME = ['nuevo', 'nueva', 'paciente', 'un', 'una', 'otro', 'otra', 'alguien'];

/** Nombre dicho en la frase (se conservan mayúsculas y tildes del texto original). */
export function extractName(text: string): string {
  const explicit = /\b(?:se llama|llamad[oa]|de nombre)\s+([^\d,.;]+)/i.exec(text);
  if (explicit?.[1]) return cleanName(explicit[1]);
  const after =
    /\b(?:ingres\w+|admit\w+)\s+(?:a\s+)?(?:(?:la|el)\s+)?(?:paciente\s+)?([^\d,.;]+)/i.exec(text);
  const candidate = after?.[1] ? cleanName(after[1]) : '';
  const first = normalize(candidate.split(' ')[0] ?? '');
  return NOT_A_NAME.includes(first) ? '' : candidate;
}

export interface AdmissionRequest {
  room: string | null;
  form: PatientForm;
}

/** Extrae habitación y formulario de la frase; lo que no se dice queda en los valores por defecto. */
export function parseAdmission(text: string, freeRooms: string[]): AdmissionRequest {
  const n = normalize(text);
  const room = /\b(20[1-9]|210)\b/.exec(n)?.[1] ?? freeRooms[0] ?? null;
  const age = /\b(\d{1,3})\s*anos\b/.exec(n)?.[1] ?? /\bedad\s+(?:de\s+)?(\d{1,3})\b/.exec(n)?.[1];
  const form: PatientForm = { ...EMPTY_FORM, name: extractName(text) };
  if (age && Number(age) <= 120) form.age = Number(age);
  form.admissionReason = REASONS.find(([re]) => re.test(n))?.[1] ?? form.admissionReason;
  form.bedRestriction = BED.find(([re]) => re.test(n))?.[1] ?? form.bedRestriction;
  form.mobility = MOBILITY.find(([re]) => re.test(n))?.[1] ?? form.mobility;
  form.anxiety = scale(n, 'ansiedad') ?? form.anxiety;
  form.sleepQuality = scale(n, 'sueno') ?? form.sleepQuality;
  form.noiseSensitivity = scale(n, 'sensibilidad al ruido') ?? form.noiseSensitivity;
  form.lightSensitivity = scale(n, 'sensibilidad a la luz') ?? form.lightSensitivity;
  if (/\briesgo de delirio alto\b|\bdelirio alto\b/.test(n)) form.deliriumRisk = 'alto';
  if (/\balergi\w+\s+(?:a\s+)?(?:los\s+)?(?:aromas?|olores|perfumes?)\b/.test(n)) {
    form.aromaAllergy = true;
    form.aromaAllergyText = 'Alergia a aromas (dictado por voz)';
  }
  return { room, form };
}
