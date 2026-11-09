import { z } from 'zod';
import {
  ADMISSION_REASONS,
  AROMA_TYPES,
  MOBILITY_LEVELS,
  PROTOCOL_IDS,
  RISK_LEVELS,
  SOUNDSCAPES,
  TRIGGER_TYPES,
  URGENCY_LEVELS,
  type Range,
} from '../types';

export const roomIdSchema = z
  .string()
  .regex(/^(20[1-9]|210)$/, 'Habitación 201–210')
  .describe('Número de habitación (201–210)');

export const roomOrAllSchema = z
  .string()
  .regex(/^(20[1-9]|210|all)$/, 'Habitación 201–210 o "all"')
  .describe('Número de habitación (201–210) o "all" para toda la planta');

export const protocolSchema = z.enum(PROTOCOL_IDS).describe('Protocolo ambiental');
export const soundscapeSchema = z.enum(SOUNDSCAPES).describe('Paisaje sonoro');
export const aromaTypeSchema = z.enum(AROMA_TYPES).describe('Tipo de aroma');
export const triggerTypeSchema = z.enum(TRIGGER_TYPES).describe('Tipo de disparador horario');
export const urgencySchema = z.enum(URGENCY_LEVELS);
export const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato HH:mm')
  .describe('Hora en formato HH:mm (24 h)');

export const durationSchema = z
  .number()
  .optional()
  .describe(
    'Duración del evento en minutos simulados; al terminar vuelve al estado previo si restoreOnEnd',
  );
export const restoreSchema = z
  .boolean()
  .optional()
  .describe('Si es true, al terminar la duración vuelve gradualmente al estado anterior');

export const DURATION_RANGE: Range = [1, 720];

export const patientFormSchema = z.object({
  age: z.number().int().min(0).max(120),
  admissionReason: z.enum(ADMISSION_REASONS),
  anxiety: z.number().min(0).max(10),
  sleepQuality: z.number().min(0).max(10),
  noiseSensitivity: z.number().min(0).max(10),
  lightSensitivity: z.number().min(0).max(10),
  mobility: z.enum(MOBILITY_LEVELS),
  deliriumRisk: z.enum(RISK_LEVELS),
  aromaAllergy: z.boolean(),
  aromaAllergyText: z.string().max(200),
  preferences: z.string().max(500),
  wantsAroma: z.boolean(),
});
