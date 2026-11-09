import { z } from 'zod';
import { t } from '../../i18n';
import { applyEnvChange } from './env';
import { DURATION_RANGE, durationSchema, restoreSchema, roomIdSchema } from './schemas';
import { defineTool, ok } from './types';

export const setLight = defineTool({
  name: 'set_light',
  description:
    'Ajusta la iluminación: intensidad (pct, 0–100 %) y temperatura de color (kelvin, 2200–6500 K), en valor absoluto o relativo (deltaPct, deltaKelvin; un delta negativo de kelvin hace la luz más cálida).',
  kind: 'env',
  schema: z
    .object({
      room: roomIdSchema,
      pct: z.number().optional().describe('Intensidad 0–100 %'),
      kelvin: z.number().optional().describe('Temperatura de color 2200–6500 K'),
      deltaPct: z.number().optional().describe('Cambio relativo de intensidad'),
      deltaKelvin: z
        .number()
        .optional()
        .describe('Cambio relativo de Kelvin (negativo = más cálida)'),
      durationMin: durationSchema,
      restoreOnEnd: restoreSchema,
    })
    .refine(
      (a) =>
        a.pct !== undefined ||
        a.kelvin !== undefined ||
        a.deltaPct !== undefined ||
        a.deltaKelvin !== undefined,
      { message: 'Indica al menos pct, kelvin, deltaPct o deltaKelvin' },
    ),
  ranges: {
    pct: [0, 100],
    kelvin: [2200, 6500],
    deltaPct: [-100, 100],
    deltaKelvin: [-4300, 4300],
    durationMin: DURATION_RANGE,
  },
  execute(args, ctx) {
    const out = applyEnvChange(
      ctx,
      args.room,
      (base) => ({
        ...base,
        lightPct: args.pct ?? base.lightPct + (args.deltaPct ?? 0),
        kelvin: args.kelvin ?? base.kelvin + (args.deltaKelvin ?? 0),
      }),
      { label: t('label.light'), durationMin: args.durationMin, restoreOnEnd: args.restoreOnEnd },
    );
    return ok({
      room: args.room,
      lightPct: out.values.lightPct,
      kelvin: out.values.kelvin,
      adjusted: out.adjusted,
      endsAt: out.endsAt,
    });
  },
});
