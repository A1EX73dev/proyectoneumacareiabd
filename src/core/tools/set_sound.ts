import { z } from 'zod';
import { t } from '../../i18n';
import { applyEnvChange } from './env';
import {
  DURATION_RANGE,
  durationSchema,
  restoreSchema,
  roomIdSchema,
  soundscapeSchema,
} from './schemas';
import { defineTool, ok } from './types';

export const setSound = defineTool({
  name: 'set_sound',
  description:
    'Ajusta el volumen (pct 0–100 % o deltaPct) y/o el paisaje sonoro de la habitación. "silencio" deja el altavoz callado.',
  kind: 'env',
  schema: z
    .object({
      room: roomIdSchema,
      pct: z.number().optional().describe('Volumen 0–100 %'),
      deltaPct: z.number().optional().describe('Cambio relativo de volumen'),
      soundscape: soundscapeSchema.optional(),
      durationMin: durationSchema,
      restoreOnEnd: restoreSchema,
    })
    .refine((a) => a.pct !== undefined || a.deltaPct !== undefined || a.soundscape !== undefined, {
      message: 'Indica pct, deltaPct o soundscape',
    }),
  ranges: { pct: [0, 100], deltaPct: [-100, 100], durationMin: DURATION_RANGE },
  execute(args, ctx) {
    const out = applyEnvChange(
      ctx,
      args.room,
      (base) => {
        const soundscape = args.soundscape ?? base.soundscape;
        let soundPct = args.pct ?? base.soundPct + (args.deltaPct ?? 0);
        if (soundscape === 'silencio' && args.pct === undefined) soundPct = 0;
        // Pedir un paisaje sin volumen no tendría efecto: se da un volumen bajo por defecto.
        if (
          args.soundscape &&
          args.soundscape !== 'silencio' &&
          soundPct === 0 &&
          args.pct === undefined
        ) {
          soundPct = 20;
        }
        return { ...base, soundscape, soundPct };
      },
      { label: t('label.sound'), durationMin: args.durationMin, restoreOnEnd: args.restoreOnEnd },
    );
    return ok({
      room: args.room,
      soundPct: out.values.soundPct,
      soundscape: out.values.soundscape,
      adjusted: out.adjusted,
      endsAt: out.endsAt,
    });
  },
});
