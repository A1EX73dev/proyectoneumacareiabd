import { z } from 'zod';
import { t } from '../../i18n';
import {
  BED_DEVICE_RANGE,
  BED_EPS,
  BED_PRESETS,
  bedGoal,
  bedLimits,
  clampBedDeg,
  describeBedLimits,
  moveBedTo,
  nearestBedPosition,
} from '../policy/bed';
import { patchRoom, withLog } from '../state';
import { getRoom } from './env';
import { bedPositionSchema, roomIdSchema } from './schemas';
import { defineTool, fail, ok } from './types';

export const setBed = defineTool({
  name: 'set_bed',
  description:
    'Mueve el respaldo de la cama articulada del paciente para incorporarlo o estirarlo. Usa "position" ("plana" = estirar a 0°, "semi" = 30°, "incorporada" = sentar a 60°), "deg" (ángulo absoluto 0–70°) o "deltaDeg" (cambio relativo; positivo = incorporar). Si la lesión del paciente limita el movimiento, la cama solo llega hasta el límite permitido, y si ya está en él la orden se rechaza.',
  kind: 'env',
  schema: z
    .object({
      room: roomIdSchema,
      position: bedPositionSchema.optional(),
      deg: z.number().optional().describe('Ángulo del respaldo 0–70° (0 = plana)'),
      deltaDeg: z
        .number()
        .optional()
        .describe('Cambio relativo en grados (positivo = incorporar, negativo = estirar)'),
    })
    .refine((a) => a.position !== undefined || a.deg !== undefined || a.deltaDeg !== undefined, {
      message: 'Indica position, deg o deltaDeg',
    }),
  ranges: { deg: BED_DEVICE_RANGE, deltaDeg: [-70, 70] },
  execute(args, ctx) {
    const room = getRoom(ctx, args.room);
    const limits = bedLimits(room.patientForm);
    const current = bedGoal(room.bed);
    const requested =
      args.deg ?? (args.position ? BED_PRESETS[args.position] : current + (args.deltaDeg ?? 0));
    const wanted = Math.round(
      clampBedDeg(requested, { min: BED_DEVICE_RANGE[0], max: BED_DEVICE_RANGE[1] }),
    );
    const allowed = clampBedDeg(wanted, limits);
    const limited = allowed !== wanted;

    if (limited && Math.abs(allowed - current) <= BED_EPS) {
      // La cama ya está en el límite: la lesión impide seguir en esa dirección.
      return fail(
        t(wanted > current ? 'error.bedCannotRaise' : 'error.bedCannotLower', {
          room: args.room,
          limits: describeBedLimits(limits),
        }),
      );
    }

    ctx.store.setState((s) =>
      patchRoom(s, args.room, (r) => {
        const next = { ...r, bed: moveBedTo(r.bed, allowed) };
        return limited
          ? withLog(next, {
              atMin: ctx.nowMin,
              action: t('log.bedLimited', { deg: allowed }),
              reason: t('reason.bedRestriction', { limits: describeBedLimits(limits) }),
              priority: ctx.priority,
              source: ctx.source,
              ok: true,
            })
          : next;
      }),
    );
    return ok({
      room: args.room,
      backrestDeg: allowed,
      position: nearestBedPosition(allowed),
      limited,
      allowedRange: [limits.min, limits.max],
    });
  },
});
