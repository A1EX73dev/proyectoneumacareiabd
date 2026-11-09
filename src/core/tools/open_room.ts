import { z } from 'zod';
import { t } from '../../i18n';
import { setView } from '../state';
import { roomIdSchema } from './schemas';
import { defineTool, fail, ok } from './types';

export const openRoom = defineTool({
  name: 'open_room',
  description: 'Abre la vista 3D de una habitación en el panel.',
  kind: 'info',
  schema: z.object({ room: roomIdSchema }),
  execute(args, ctx) {
    if (!ctx.store.getState().rooms[args.room]) {
      return fail(t('error.roomNotFound', { room: args.room }));
    }
    ctx.store.setState((s) => setView(s, 'room', args.room));
    return ok({ room: args.room, view: 'room' });
  },
});
