/**
 * Utilidades del reloj simulado. El tiempo se expresa en minutos absolutos
 * desde el día 0 a las 00:00 (pueden tener decimales).
 */

export const MIN_PER_DAY = 1440;

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function isValidHHmm(value: string): boolean {
  return HHMM.test(value);
}

/** "13:30" → 810 */
export function parseHHmm(value: string): number {
  const match = HHMM.exec(value);
  if (!match) throw new Error(`Hora no válida: ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function minuteOfDay(absMin: number): number {
  return ((Math.floor(absMin) % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
}

export function dayOf(absMin: number): number {
  return Math.floor(absMin / MIN_PER_DAY);
}

/** 810 → "13:30" (acepta minutos absolutos). */
export function formatHHmm(absMin: number): string {
  const m = minuteOfDay(absMin);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Hora del día con decimales (0–24). */
export function hourOf(absMin: number): number {
  return (((absMin % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY) / 60;
}

/** Minutos que faltan hasta la próxima vez que el reloj marque `targetMinOfDay`. */
export function minutesUntil(absMin: number, targetMinOfDay: number): number {
  const diff = (targetMinOfDay - (absMin % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
  return diff === 0 ? MIN_PER_DAY : diff;
}

/** Próximo instante absoluto (estrictamente posterior o igual) en que el reloj marca HH:mm. */
export function nextOccurrence(absMin: number, hhmm: string): number {
  const target = dayOf(absMin) * MIN_PER_DAY + parseHHmm(hhmm);
  return target > absMin ? target : target + MIN_PER_DAY;
}

export type DayPhase = 'night' | 'morning' | 'day';

/** Fases circadianas: noche 22:00–06:00, mañana 06:00–10:00, día 10:00–22:00. */
export const PHASE_START = { morning: 6 * 60, day: 10 * 60, night: 22 * 60 } as const;
export const MORNING_HHMM = '06:00';

export function phaseAt(absMin: number): DayPhase {
  const m = minuteOfDay(absMin);
  if (m >= PHASE_START.night || m < PHASE_START.morning) return 'night';
  if (m < PHASE_START.day) return 'morning';
  return 'day';
}
