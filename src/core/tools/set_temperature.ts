import { z } from 'zod';
import { t } from '../../i18n';
import { applyEnvChange } from './env';
import { DURATION_RANGE, durationSchema, restoreSchema, roomIdSchema } from './schemas';
import { defineTool, ok } from './types';

export const setTemperature = defineTool({
  name: 'set_temperature',
  description:
    'Fija la temperatura de consigna de una habitación (°C). Usa "value" para un valor absoluto o "delta" para un cambio relativo. El cambio se aplica con rampa.',
  kind: 'env',
  schema: z
    .object({
      room: roomIdSchema,
      value: z.number().optional().describe('Temperatura objetivo en °C (18–28)'),
      delta: z.number().optional().describe('Cambio relativo en °C (−5 a +5)'),
      durationMin: durationSchema,
      restoreOnEnd: restoreSchema,
    })
    .refine((a) => a.value !== undefined || a.delta !== undefined, {
      message: 'Indica "value" o "delta"',
    }),
  ranges: { value: [18, 28], delta: [-5, 5], durationMin: DURATION_RANGE },
  execute(args, ctx) {
    const out = applyEnvChange(
      ctx,
      args.room,
      (base) => ({ ...base, tempC: args.value ?? base.tempC + (args.delta ?? 0) }),
      {
        label: t('label.temperature'),
        durationMin: args.durationMin,
        restoreOnEnd: args.restoreOnEnd,
      },
    );
    return ok({
      room: args.room,
      tempC: out.values.tempC,
      adjusted: out.adjusted,
      endsAt: out.endsAt,
    });
  },
});
