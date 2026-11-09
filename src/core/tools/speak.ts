import { z } from 'zod';
import { pushSpeech } from '../state';
import { roomIdSchema } from './schemas';
import { defineTool, ok } from './types';

export const speak = defineTool({
  name: 'speak',
  description:
    'Dice un mensaje breve en voz alta (síntesis del navegador) y lo muestra en la conversación. Úsalo para confirmar o pedir aclaraciones.',
  kind: 'info',
  schema: z.object({
    text: z.string().min(1).max(500).describe('Mensaje breve en el idioma del usuario'),
    room: roomIdSchema.optional(),
  }),
  execute(args, ctx) {
    ctx.store.setState((s) => pushSpeech(s, args.text));
    return ok({ queued: true });
  },
});
