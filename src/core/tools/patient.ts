import { t } from '../../i18n';
import { bedLimits, describeBedLimits, enforceBedLimits } from '../policy/bed';
import { withLog } from '../state';
import type { ClassificationResult, Room } from '../types';
import type { ToolContext } from './types';

/**
 * Tras cambiar los datos del paciente: si su lesión no admite la posición que tiene la
 * cama, se lleva al límite permitido y queda anotado en el registro de la sala.
 */
export function withBedWithinLimits(room: Room, ctx: ToolContext): Room {
  const { room: next, movedTo } = enforceBedLimits(room);
  if (movedTo === null) return next;
  return withLog(next, {
    atMin: ctx.nowMin,
    action: t('log.bedAdjusted', { deg: movedTo }),
    reason: t('reason.bedRestriction', {
      limits: describeBedLimits(bedLimits(next.patientForm)),
    }),
    priority: ctx.priority,
    source: ctx.source,
    ok: true,
  });
}

/** Resumen de una clasificación para el resultado de una función (sin los rangos completos). */
export function classificationSummary(result: ClassificationResult) {
  return {
    category: result.category,
    confidence: result.confidence,
    rationale: result.rationale,
    params: {
      aromaBlocked: result.params.aromaBlocked,
      aromaAllowed: result.params.aromaAllowed,
      preferredSoundscape: result.params.preferredSoundscape,
      circadian: result.params.circadian,
    },
  };
}
