import { z } from 'zod';
import { newId } from '../ids';
import { pushNotification } from '../state';
import { roomIdSchema, urgencySchema } from './schemas';
import { defineTool, ok } from './types';

export const notifyStaff = defineTool({
  name: 'notify_staff',
  description:
    'Envía un aviso (simulado) al control de enfermería con un mensaje y una urgencia (baja, media, alta).',
  kind: 'info',
  schema: z.object({
    room: roomIdSchema.optional(),
    message: z.string().min(1).max(280).describe('Texto del aviso'),
    urgency: urgencySchema.default('media'),
  }),
  execute(args, ctx) {
    const id = newId('ntf');
    ctx.store.setState((s) =>
      pushNotification(s, {
        id,
        atMin: ctx.nowMin,
        room: args.room ?? null,
        message: args.message,
        urgency: args.urgency,
      }),
    );
    return ok({ id, delivered: true, simulated: true });
  },
});
