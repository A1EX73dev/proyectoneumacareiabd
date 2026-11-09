import { z } from 'zod';
import { t } from '../../i18n';
import { defineTool, fail, ok } from './types';

export const cancelTrigger = defineTool({
  name: 'cancel_trigger',
  description: 'Elimina un disparador horario por su id.',
  kind: 'admin',
  schema: z.object({ id: z.string().describe('Id del disparador') }),
  execute(args, ctx) {
    const existing = ctx.store.getState().triggers.find((tr) => tr.id === args.id);
    if (!existing) return fail(t('error.triggerNotFound', { id: args.id }));
    ctx.store.setState((s) => ({ triggers: s.triggers.filter((tr) => tr.id !== args.id) }));
    return ok({ id: args.id, type: existing.type, time: existing.time, cancelled: true });
  },
});
