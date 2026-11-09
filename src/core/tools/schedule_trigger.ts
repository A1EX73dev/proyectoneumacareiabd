import { z } from 'zod';
import { t } from '../../i18n';
import { newId } from '../ids';
import { TRIGGER_PROFILES } from '../policy/triggerProfiles';
import type { Trigger } from '../types';
import { DURATION_RANGE, roomOrAllSchema, timeSchema, triggerTypeSchema } from './schemas';
import { defineTool, fail, ok } from './types';

export const scheduleTrigger = defineTool({
  name: 'schedule_trigger',
  description:
    'Crea un disparador horario (comidas, medicación, cura, visita, descanso, despertar, constantes) o, si se indica "id", edita uno existente (hora, sala, duración, repetición o activación).',
  kind: 'admin',
  schema: z.object({
    id: z.string().optional().describe('Id de un disparador existente para editarlo'),
    type: triggerTypeSchema.optional(),
    room: roomOrAllSchema.optional(),
    time: timeSchema.optional(),
    repeat: z.enum(['daily', 'once']).optional().describe('Repetición diaria o una sola vez'),
    durationMin: z.number().optional().describe('Duración de la ventana del evento en minutos'),
    enabled: z.boolean().optional(),
    params: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  }),
  ranges: { durationMin: DURATION_RANGE },
  execute(args, ctx) {
    const state = ctx.store.getState();
    if (args.room && args.room !== 'all' && !state.rooms[args.room]) {
      return fail(t('error.roomNotFound', { room: args.room }));
    }
    if (args.id) {
      const existing = state.triggers.find((tr) => tr.id === args.id);
      if (!existing) return fail(t('error.triggerNotFound', { id: args.id }));
      const updated: Trigger = {
        ...existing,
        type: args.type ?? existing.type,
        roomId: args.room ?? existing.roomId,
        time: args.time ?? existing.time,
        repeat: args.repeat ?? existing.repeat,
        durationMin: args.durationMin ?? existing.durationMin,
        enabled: args.enabled ?? existing.enabled,
        params: args.params ?? existing.params,
        lastFiredKey: args.time && args.time !== existing.time ? null : existing.lastFiredKey,
      };
      ctx.store.setState((s) => ({
        triggers: s.triggers.map((tr) => (tr.id === updated.id ? updated : tr)),
      }));
      return ok({ trigger: updated, updated: true });
    }
    if (!args.type || !args.time) return fail(t('error.triggerMissing'));
    const profile = TRIGGER_PROFILES[args.type];
    const trigger: Trigger = {
      id: newId('trg'),
      type: args.type,
      roomId: args.room ?? 'all',
      time: args.time,
      repeat: args.repeat ?? 'daily',
      durationMin: args.durationMin ?? profile.defaultDuration,
      enabled: args.enabled ?? true,
      params: args.params ?? {},
      lastFiredKey: null,
    };
    ctx.store.setState((s) => ({
      triggers: [...s.triggers, trigger].sort((a, b) => a.time.localeCompare(b.time)),
    }));
    return ok({ trigger, created: true });
  },
});
