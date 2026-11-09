import { z } from 'zod';
import { t } from '../../i18n';
import { classifier } from '../classify';
import { isOverrideActive } from '../policy/priorities';
import { resolveProtocol } from '../policy/protocols';
import { patchRoom, setRoomTarget } from '../state';
import { PRIORITY, type Room } from '../types';
import { patientFormSchema, roomIdSchema } from './schemas';
import { defineTool, fail, ok } from './types';

export const classifyPatient = defineTool({
  name: 'classify_patient',
  description:
    'Clasifica al paciente en una de 3 categorías (A calma y confort, B descanso y orientación, C activación y recuperación) a partir del formulario. Devuelve categoría, confianza, motivos y parámetros. Los datos solo viven en memoria.',
  kind: 'admin',
  schema: z.object({
    room: roomIdSchema,
    form: patientFormSchema,
  }),
  execute(args, ctx) {
    if (!ctx.store.getState().rooms[args.room]) {
      return fail(t('error.roomNotFound', { room: args.room }));
    }
    const result = classifier.classify(args.form);
    ctx.store.setState((s) =>
      patchRoom(s, args.room, (r) => {
        let next: Room = {
          ...r,
          occupied: true,
          patientForm: args.form,
          category: result.category,
          classification: result,
        };
        // Si la sala la gestiona el agente (o un procedimiento), se re-personaliza el protocolo actual.
        const agentControlled =
          !isOverrideActive(r.override, ctx.nowMin) || r.override.priority >= PRIORITY.PROCEDURE;
        if (agentControlled) {
          next = setRoomTarget(
            next,
            resolveProtocol(r.protocol, result.category, args.form),
            false,
          );
        } else {
          next = setRoomTarget(next, r.target ?? r.values, false);
        }
        return next;
      }),
    );
    return ok({
      category: result.category,
      confidence: result.confidence,
      rationale: result.rationale,
      params: {
        aromaBlocked: result.params.aromaBlocked,
        aromaAllowed: result.params.aromaAllowed,
        preferredSoundscape: result.params.preferredSoundscape,
        circadian: result.params.circadian,
      },
    });
  },
});
