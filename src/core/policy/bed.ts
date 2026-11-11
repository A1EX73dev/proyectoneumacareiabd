import { t } from '../../i18n';
import type {
  BedPosition,
  BedRestriction,
  BedState,
  PatientForm,
  Range,
  Room,
} from '../types';

/**
 * Cama articulada: recorrido del respaldo y límites por lesión.
 *
 * La cama solo se mueve con una orden explícita (`set_bed`): ni los protocolos ni los
 * disparadores la tocan. Lo que sí se garantiza siempre es que el respaldo no sale del
 * rango que admite la lesión del paciente, venga la orden del panel, de la voz o de la IA.
 */

/** Recorrido físico del respaldo, en grados (0 = plana). */
export const BED_DEVICE_RANGE: Range = [0, 70];

/** Ángulo de cada posición con nombre. */
export const BED_PRESETS: Record<BedPosition, number> = { plana: 0, semi: 30, incorporada: 60 };

/** Posición en la que se deja la cama al preparar la habitación. */
export const BED_DEFAULT_DEG = BED_PRESETS.semi;

/**
 * Rango de respaldo que admite cada lesión. Son valores orientativos para la simulación,
 * no una pauta clínica: se cambian aquí y el resto del sistema los respeta.
 */
export const BED_LIMITS: Record<BedRestriction, Range> = {
  ninguna: BED_DEVICE_RANGE,
  // Reposo en plano: no se puede incorporar.
  columna: [0, 0],
  // Flexión de cadera limitada: se puede incorporar solo hasta 45°.
  cadera: [0, 45],
  // Riesgo de aspiración o disnea: no se puede estirar por debajo de 30°.
  respiratoria: [30, 70],
  // Cabecero fijo a 30°: ni incorporar ni estirar.
  craneal: [30, 30],
};

/** Margen por debajo del cual se considera que el respaldo ya está en su sitio. */
export const BED_EPS = 0.5;

export interface BedLimits {
  restriction: BedRestriction;
  min: number;
  max: number;
  /** true si la lesión recorta el recorrido de la cama. */
  restricted: boolean;
}

export function bedLimits(form: PatientForm | null): BedLimits {
  const restriction = form?.bedRestriction ?? 'ninguna';
  const [min, max] = BED_LIMITS[restriction] ?? BED_DEVICE_RANGE;
  return { restriction, min, max, restricted: restriction !== 'ninguna' };
}

export function clampBedDeg(deg: number, limits: Pick<BedLimits, 'min' | 'max'>): number {
  return Math.min(limits.max, Math.max(limits.min, deg));
}

/**
 * Rango permitido en texto. No nombra la lesión: este mensaje también le llega al agente
 * de IA, que solo debe conocer el límite, no el dato clínico.
 */
export function describeBedLimits(limits: Pick<BedLimits, 'min' | 'max'>): string {
  return limits.min === limits.max
    ? t('bed.limitsFixed', { deg: limits.min })
    : t('bed.limitsRange', { min: limits.min, max: limits.max });
}

/** Ángulo al que va la cama: el pedido si se está moviendo, o el actual. */
export function bedGoal(bed: BedState): number {
  return bed.targetDeg ?? bed.backrestDeg;
}

/** Posición con nombre que mejor describe un ángulo. */
export function nearestBedPosition(deg: number): BedPosition {
  if (deg < 15) return 'plana';
  return deg < 45 ? 'semi' : 'incorporada';
}

/** Pide a la cama que vaya a `deg` (si ya está ahí, no queda nada pendiente). */
export function moveBedTo(bed: BedState, deg: number): BedState {
  return Math.abs(deg - bed.backrestDeg) <= BED_EPS
    ? { backrestDeg: deg, targetDeg: null }
    : { backrestDeg: bed.backrestDeg, targetDeg: deg };
}

/** Avanza el respaldo hacia su objetivo una fracción `k` (0–1) de la distancia restante. */
export function stepBed(bed: BedState, k: number): BedState {
  if (bed.targetDeg === null) return bed;
  const moved = bed.backrestDeg + (bed.targetDeg - bed.backrestDeg) * k;
  return Math.abs(bed.targetDeg - moved) <= BED_EPS
    ? { backrestDeg: bed.targetDeg, targetDeg: null }
    : { backrestDeg: moved, targetDeg: bed.targetDeg };
}

/**
 * Deja la cama dentro del rango que admite el paciente de la sala. Se aplica al ingresar o
 * reclasificar: si la lesión nueva no permite la posición actual, la cama va al límite.
 * `movedTo` es el ángulo al que se ha enviado, o null si ya cumplía.
 */
export function enforceBedLimits(room: Room): { room: Room; movedTo: number | null } {
  const goal = bedGoal(room.bed);
  const allowed = clampBedDeg(goal, bedLimits(room.patientForm));
  if (Math.abs(allowed - goal) <= BED_EPS) return { room, movedTo: null };
  return { room: { ...room, bed: moveBedTo(room.bed, allowed) }, movedTo: allowed };
}
