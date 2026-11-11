import { z } from 'zod';
import { t } from '../../i18n';
import { classifier } from '../classify';
import { BED_DEFAULT_DEG, bedLimits, clampBedDeg, describeBedLimits, moveBedTo } from '../policy/bed';
import { isOverrideActive } from '../policy/priorities';
import { phaseProtocol, resolveProtocol } from '../policy/protocols';
import { patchRoom, redactPatientData, setRoomTarget, withLog } from '../state';
import { phaseAt } from '../time';
import { PRIORITY, type Room } from '../types';
import { classificationSummary } from './patient';
import { patientFormSchema, roomIdSchema } from './schemas';
import { defineTool, fail, ok } from './types';

export const admitPatient = defineTool({
  name: 'admit_patient',
  description:
    'Ingresa un paciente en una habitación: guarda su formulario (solo en memoria), lo clasifica, deja la sala en Modo IA con el protocolo de la hora adaptado a su categoría y prepara la cama dentro de lo que permite su lesión. Si la habitación ya está ocupada hay que confirmar la sustitución con "replace": true.',
  kind: 'admin',
  schema: z.object({
    room: roomIdSchema,
    form: patientFormSchema,
    replace: z
      .boolean()
      .optional()
      .describe('true = confirmar que se sustituye al paciente que ocupa la habitación'),
  }),
  execute(args, ctx) {
    const room = ctx.store.getState().rooms[args.room];
    if (!room) return fail(t('error.roomNotFound', { room: args.room }));
    // Una habitación ocupada no se pisa sin confirmación expresa.
    if (room.occupied && !args.replace) return fail(t('error.roomOccupied', { room: args.room }));
    if (isOverrideActive(room.override, ctx.nowMin) && room.override.priority === PRIORITY.SAFETY) {
      return fail(t('error.admitDuringAlarm', { room: args.room }));
    }

    const replaced = room.occupied;
    const result = classifier.classify(args.form);
    const protocol = phaseProtocol(phaseAt(ctx.nowMin), result.category);
    const limits = bedLimits(args.form);
    const bedDeg = clampBedDeg(BED_DEFAULT_DEG, limits);

    ctx.store.setState((s) =>
      // Privacidad: los datos del paciente anterior desaparecen también del registro de llamadas.
      patchRoom(replaced ? redactPatientData(s, args.room) : s, args.room, (r) => {
        let next: Room = {
          ...r,
          occupied: true,
          patientForm: args.form,
          category: result.category,
          classification: result,
          protocol,
          // Paciente nuevo: la sala empieza de cero, gestionada por el agente.
          auto: true,
          override: null,
          bed: moveBedTo(r.bed, bedDeg),
        };
        next = setRoomTarget(next, resolveProtocol(protocol, result.category, args.form), false);
        if (limits.restricted) {
          next = withLog(next, {
            atMin: ctx.nowMin,
            action: t('log.bedAdjusted', { deg: bedDeg }),
            reason: t('reason.bedRestriction', { limits: describeBedLimits(limits) }),
            priority: ctx.priority,
            source: ctx.source,
            ok: true,
          });
        }
        return next;
      }),
    );

    return ok({
      room: args.room,
      replaced,
      protocol,
      ...classificationSummary(result),
      bed: { backrestDeg: bedDeg, allowedRange: [limits.min, limits.max] },
    });
  },
});
