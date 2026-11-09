import { z } from 'zod';
import { tk } from '../../i18n';
import { resolveProtocol } from '../policy/protocols';
import { applyEnvChange } from './env';
import {
  DURATION_RANGE,
  durationSchema,
  protocolSchema,
  restoreSchema,
  roomIdSchema,
} from './schemas';
import { defineTool, ok } from './types';

export const applyProtocol = defineTool({
  name: 'apply_protocol',
  description:
    'Aplica un protocolo ambiental completo (noche, calma, manana, comida, medicacion, cura, visita, neutro) personalizado para la categoría del paciente y recortado a sus rangos. Con durationMin y restoreOnEnd vuelve después al estado previo.',
  kind: 'env',
  schema: z.object({
    room: roomIdSchema,
    protocol: protocolSchema,
    durationMin: durationSchema,
    restoreOnEnd: restoreSchema,
  }),
  ranges: { durationMin: DURATION_RANGE },
  execute(args, ctx) {
    const out = applyEnvChange(
      ctx,
      args.room,
      (_base, room) => resolveProtocol(args.protocol, room.category, room.patientForm),
      {
        label: tk('protocol', args.protocol),
        protocol: args.protocol,
        durationMin: args.durationMin,
        restoreOnEnd: args.restoreOnEnd ?? false,
      },
    );
    return ok({
      room: args.room,
      protocol: args.protocol,
      target: out.values,
      adjusted: out.adjusted,
      endsAt: out.endsAt,
    });
  },
});
