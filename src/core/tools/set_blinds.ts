import { z } from 'zod';
import { t } from '../../i18n';
import { applyEnvChange } from './env';
import { DURATION_RANGE, durationSchema, restoreSchema, roomIdSchema } from './schemas';
import { defineTool, ok } from './types';

export const setBlinds = defineTool({
  name: 'set_blinds',
  description:
    'Sube o baja la persiana eléctrica de la habitación. "pct" es la apertura: 0 = bajada del todo (a oscuras), 100 = subida del todo (entra toda la luz natural). "deltaPct" es un cambio relativo (positivo = subir). El movimiento es gradual.',
  kind: 'env',
  schema: z
    .object({
      room: roomIdSchema,
      pct: z.number().optional().describe('Apertura 0–100 % (0 = bajada, 100 = subida)'),
      deltaPct: z.number().optional().describe('Cambio relativo de apertura (positivo = subir)'),
      durationMin: durationSchema,
      restoreOnEnd: restoreSchema,
    })
    .refine((a) => a.pct !== undefined || a.deltaPct !== undefined, {
      message: 'Indica pct o deltaPct',
    }),
  ranges: { pct: [0, 100], deltaPct: [-100, 100], durationMin: DURATION_RANGE },
  execute(args, ctx) {
    const out = applyEnvChange(
      ctx,
      args.room,
      (base) => ({ ...base, blindsPct: args.pct ?? base.blindsPct + (args.deltaPct ?? 0) }),
      { label: t('label.blinds'), durationMin: args.durationMin, restoreOnEnd: args.restoreOnEnd },
    );
    return ok({
      room: args.room,
      blindsPct: out.values.blindsPct,
      adjusted: out.adjusted,
      endsAt: out.endsAt,
    });
  },
});
