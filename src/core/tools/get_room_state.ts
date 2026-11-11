import { z } from 'zod';
import { t } from '../../i18n';
import { bedLimits } from '../policy/bed';
import { isOverrideActive } from '../policy/priorities';
import { formatHHmm } from '../time';
import { roomIdSchema } from './schemas';
import { defineTool, fail, ok } from './types';

export const getRoomState = defineTool({
  name: 'get_room_state',
  description:
    'Devuelve el estado de una habitación: ocupación, categoría, protocolo, Modo IA, valores actuales y objetivo (incluida la persiana), posición de la cama con su rango permitido, evento activo y lecturas simuladas. No incluye datos clínicos del formulario.',
  kind: 'info',
  schema: z.object({ room: roomIdSchema }),
  execute(args, ctx) {
    const room = ctx.store.getState().rooms[args.room];
    if (!room) return fail(t('error.roomNotFound', { room: args.room }));
    const active = isOverrideActive(room.override, ctx.nowMin) ? room.override : null;
    const limits = bedLimits(room.patientForm);
    return ok({
      room: room.id,
      occupied: room.occupied,
      category: room.category,
      protocol: room.protocol,
      auto: room.auto,
      values: {
        ...room.values,
        tempC: Math.round(room.values.tempC * 10) / 10,
        lightPct: Math.round(room.values.lightPct),
        kelvin: Math.round(room.values.kelvin),
        blindsPct: Math.round(room.values.blindsPct),
        soundPct: Math.round(room.values.soundPct),
        aromaPct: Math.round(room.values.aromaPct),
      },
      target: room.target,
      // Solo el rango permitido: la lesión que lo motiva no sale del formulario.
      bed: {
        backrestDeg: Math.round(room.bed.backrestDeg),
        targetDeg: room.bed.targetDeg,
        allowedRange: [limits.min, limits.max],
      },
      activeEvent: active
        ? {
            label: active.label,
            priority: active.priority,
            endsAt: active.endMin === null ? null : formatHHmm(active.endMin),
          }
        : null,
      readings: {
        tempC: Math.round(room.readings.tempC * 10) / 10,
        noiseDb: Math.round(room.readings.noiseDb),
        lux: Math.round(room.readings.lux),
      },
    });
  },
});
