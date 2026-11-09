import { t, tk } from '../../i18n';
import { PRIORITY, type Override, type PriorityLevel } from '../types';

export function priorityLabel(priority: PriorityLevel): string {
  return tk('priority', String(priority));
}

/** Un override está activo si no tiene fin o si aún no ha llegado su hora de fin. */
export function isOverrideActive(override: Override | null, nowMin: number): override is Override {
  return override !== null && (override.endMin === null || nowMin < override.endMin);
}

export interface PriorityCheck {
  allowed: boolean;
  reason: string | null;
}

/**
 * Regla central de la jerarquía: una llamada con prioridad `incoming` puede actuar
 * si no hay override activo, si pertenece al mismo evento, o si es igual o más prioritaria.
 */
export function checkPriority(
  current: Override | null,
  incoming: PriorityLevel,
  nowMin: number,
  eventId?: string,
): PriorityCheck {
  if (!isOverrideActive(current, nowMin)) return { allowed: true, reason: null };
  if (eventId !== undefined && current.eventId === eventId) return { allowed: true, reason: null };
  if (incoming <= current.priority) return { allowed: true, reason: null };
  return {
    allowed: false,
    reason: t('policy.blocked', {
      incoming: priorityLabel(incoming),
      current: priorityLabel(current.priority),
      label: current.label,
    }),
  };
}

/** Duración por defecto (min simulados) del override que crea cada prioridad; null = sin fin. */
export function defaultDurationFor(priority: PriorityLevel): number | null {
  switch (priority) {
    case PRIORITY.SAFETY:
      return 10;
    case PRIORITY.PROCEDURE:
      return 60;
    case PRIORITY.SLEEP:
      return 480;
    default:
      return null;
  }
}
