import { z } from 'zod';
import { roomOrAllSchema } from './schemas';
import { defineTool, ok } from './types';

export const listTriggers = defineTool({
  name: 'list_triggers',
  description:
    'Lista los disparadores horarios. Con "room" devuelve los de esa habitación más los de toda la planta.',
  kind: 'info',
  schema: z.object({ room: roomOrAllSchema.optional() }),
  execute(args, ctx) {
    const all = ctx.store.getState().triggers;
    const triggers =
      args.room && args.room !== 'all'
        ? all.filter((tr) => tr.roomId === 'all' || tr.roomId === args.room)
        : all;
    return ok({
      count: triggers.length,
      triggers: triggers.map(({ id, type, roomId, time, repeat, durationMin, enabled }) => ({
        id,
        type,
        roomId,
        time,
        repeat,
        durationMin,
        enabled,
      })),
    });
  },
});
