import type { CategoryId, PriorityLevel, ProtocolId, Urgency } from '../core/types';

/**
 * Color de cada protocolo. Va siempre acompañado del nombre escrito (nunca es el único
 * canal) y solo se usa en marcas pequeñas o como tinte suave del plano.
 *
 * Los siete tonos están comprobados entre sí, par a par, con un validador de daltonismo:
 * ningún par queda por debajo del umbral de visión normal (ΔE ≥ 15) y el peor par con
 * deuteranopía (medicación/calma, ΔE 6,6) se apoya en la etiqueta. «Neutro» es un gris a
 * propósito: significa ausencia de protocolo especial.
 */
export const PROTOCOL_COLORS: Record<ProtocolId, string> = {
  noche: '#4338ca',
  calma: '#a78bfa',
  manana: '#facc15',
  comida: '#f97316',
  medicacion: '#06b6d4',
  cura: '#e11d48',
  visita: '#15803d',
  neutro: '#94a3b8',
};

export const CATEGORY_BADGE: Record<CategoryId, string> = {
  A: 'bg-violet-100 text-violet-900 ring-violet-300',
  B: 'bg-indigo-100 text-indigo-900 ring-indigo-300',
  C: 'bg-emerald-100 text-emerald-900 ring-emerald-300',
};

export const URGENCY_BADGE: Record<Urgency, string> = {
  baja: 'bg-slate-100 text-slate-800',
  media: 'bg-amber-100 text-amber-900',
  alta: 'bg-red-100 text-red-900',
};

export const PRIORITY_BADGE: Record<PriorityLevel, string> = {
  1: 'bg-red-100 text-red-900',
  2: 'bg-orange-100 text-orange-900',
  3: 'bg-amber-100 text-amber-900',
  4: 'bg-indigo-100 text-indigo-900',
  5: 'bg-emerald-100 text-emerald-900',
  6: 'bg-slate-100 text-slate-800',
};

export const fmtTemp = (v: number): string => `${(Math.round(v * 10) / 10).toFixed(1)} °C`;
export const fmtPct = (v: number): string => `${Math.round(v)} %`;
export const fmtKelvin = (v: number): string => `${Math.round(v / 10) * 10} K`;
export const fmtDb = (v: number): string => `${Math.round(v)} dB`;
export const fmtLux = (v: number): string => `${Math.round(v)} lx`;
export const fmtDeg = (v: number): string => `${Math.round(v)}°`;

export function toJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
