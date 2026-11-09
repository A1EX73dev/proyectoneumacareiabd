import { z } from 'zod';
import { t } from '../../i18n';
import { enforceRules, patientFlags } from '../policy/protocols';
import type { EnvValues } from '../types';
import { applyEnvChange, getRoom } from './env';
import {
  aromaTypeSchema,
  DURATION_RANGE,
  durationSchema,
  restoreSchema,
  roomIdSchema,
} from './schemas';
import { defineTool, fail, ok } from './types';

export const setAroma = defineTool({
  name: 'set_aroma',
  description:
    'Enciende o apaga el difusor de aroma, con intensidad (pct 0–100 %) y tipo. Si el paciente tiene alergia a aromas, encenderlo siempre se rechaza.',
  kind: 'env',
  schema: z.object({
    room: roomIdSchema,
    on: z.boolean().describe('true = encender difusor, false = apagar'),
    pct: z.number().optional().describe('Intensidad 0–100 %'),
    type: aromaTypeSchema.optional(),
    durationMin: durationSchema,
    restoreOnEnd: restoreSchema,
  }),
  ranges: { pct: [0, 100], durationMin: DURATION_RANGE },
  execute(args, ctx) {
    const room = getRoom(ctx, args.room);
    if (args.on && patientFlags(room.patientForm).aromaBlocked) {
      return fail(t('error.aromaAllergy', { room: args.room }));
    }
    const compute = (base: EnvValues): EnvValues => ({
      ...base,
      aromaOn: args.on,
      aromaType: args.type ?? base.aromaType,
      aromaPct: args.on ? (args.pct ?? (base.aromaPct > 0 ? base.aromaPct : 20)) : base.aromaPct,
    });
    if (args.on) {
      // Comprobación previa: las reglas de la categoría (o la falta de consentimiento) pueden impedirlo.
      const preview = enforceRules(compute(room.target ?? room.values), {
        category: room.category,
        protocol: room.protocol,
        form: room.patientForm,
        priority: ctx.priority,
      });
      if (!preview.values.aromaOn) return fail(t('error.aromaNotAllowed', { room: args.room }));
    }
    const out = applyEnvChange(ctx, args.room, compute, {
      label: t('label.aroma'),
      durationMin: args.durationMin,
      restoreOnEnd: args.restoreOnEnd,
    });
    return ok({
      room: args.room,
      aromaOn: out.values.aromaOn,
      aromaPct: out.values.aromaPct,
      aromaType: out.values.aromaType,
      adjusted: out.adjusted,
      endsAt: out.endsAt,
    });
  },
});
