import { z } from 'zod';
import { t } from '../../i18n';
import { patchRoom, redactPatientData } from '../state';
import { roomIdSchema } from './schemas';
import { defineTool, fail, ok } from './types';

export const clearPatient = defineTool({
  name: 'clear_patient',
  description:
    'Borra de la memoria los datos del paciente de una habitación (formulario y clasificación). El aroma se apaga por falta de consentimiento.',
  kind: 'admin',
  schema: z.object({ room: roomIdSchema }),
  execute(args, ctx) {
    if (!ctx.store.getState().rooms[args.room]) {
      return fail(t('error.roomNotFound', { room: args.room }));
    }
    ctx.store.setState((s) =>
      redactPatientData(
        patchRoom(s, args.room, (r) => {
          const base = r.target ?? r.values;
          return {
            ...r,
            patientForm: null,
            category: null,
            classification: null,
            target: { ...base, aromaOn: false },
          };
        }),
        args.room,
      ),
    );
    return ok({ room: args.room, cleared: true });
  },
});
