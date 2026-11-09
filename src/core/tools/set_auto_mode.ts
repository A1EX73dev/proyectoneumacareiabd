import { z } from 'zod';
import { t } from '../../i18n';
import { isOverrideActive } from '../policy/priorities';
import { patchRoom, withLog } from '../state';
import { PRIORITY } from '../types';
import { getRoom } from './env';
import { roomIdSchema } from './schemas';
import { defineTool, ok } from './types';

export const setAutoMode = defineTool({
  name: 'set_auto_mode',
  description:
    'Activa o desactiva el Modo IA de una habitación. Al activarlo se libera la orden manual sin fin para que el agente vuelva a gestionar la sala.',
  kind: 'admin',
  schema: z.object({
    room: roomIdSchema,
    on: z.boolean().describe('true = Modo IA activo'),
  }),
  execute(args, ctx) {
    const room = getRoom(ctx, args.room);
    const manualHold =
      isOverrideActive(room.override, ctx.nowMin) &&
      room.override.priority === PRIORITY.MANUAL &&
      room.override.endMin === null;
    const released = args.on && manualHold;
    ctx.store.setState((s) =>
      patchRoom(s, args.room, (r) => {
        const next = { ...r, auto: args.on, override: released ? null : r.override };
        return released
          ? withLog(next, {
              atMin: ctx.nowMin,
              action: t('log.manualReleased'),
              reason: ctx.reason,
              priority: PRIORITY.MANUAL,
              source: ctx.source,
              ok: true,
            })
          : next;
      }),
    );
    return ok({ room: args.room, auto: args.on, manualReleased: released });
  },
});
