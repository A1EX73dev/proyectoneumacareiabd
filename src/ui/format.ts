import type { CategoryId, ProtocolId, Urgency } from '../core/types';

export const PROTOCOL_COLORS: Record<ProtocolId, string> = {
  noche: '#4338ca',
  calma: '#a78bfa',
  manana: '#facc15',
  comida: '#fb923c',
  medicacion: '#38bdf8',
  cura: '#f87171',
  visita: '#f472b6',
  neutro: '#cbd5e1',
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

export const fmtTemp = (v: number): string => `${(Math.round(v * 10) / 10).toFixed(1)} °C`;
export const fmtPct = (v: number): string => `${Math.round(v)} %`;
export const fmtKelvin = (v: number): string => `${Math.round(v / 10) * 10} K`;
export const fmtDb = (v: number): string => `${Math.round(v)} dB`;
export const fmtLux = (v: number): string => `${Math.round(v)} lx`;

export function toJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
