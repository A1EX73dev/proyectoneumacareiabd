import { newId } from '../ids';
import {
  PRIORITY,
  type PriorityLevel,
  type ProtocolId,
  type Trigger,
  type TriggerType,
  type Urgency,
} from '../types';

/**
 * Perfil de acción de cada tipo de disparador. El protocolo se personaliza después
 * con la categoría del paciente (ver `resolveProtocol`).
 */
export interface TriggerProfile {
  protocol: ProtocolId;
  priority: PriorityLevel;
  defaultTimes: string[];
  defaultDuration: number;
  defaultRoom: string | 'all';
  /** Al terminar, volver gradualmente al estado previo. */
  restoreOnEnd: boolean;
  /** fixed: dura `durationMin`; untilMorning: hasta las 06:00; none: sin fin (estado base). */
  durationMode: 'fixed' | 'untilMorning' | 'none';
  notify: Urgency | null;
  announce: boolean;
}

export const TRIGGER_PROFILES: Record<TriggerType, TriggerProfile> = {
  desayuno: {
    protocol: 'comida',
    priority: PRIORITY.PROCEDURE,
    defaultTimes: ['08:30'],
    defaultDuration: 45,
    defaultRoom: 'all',
    restoreOnEnd: true,
    durationMode: 'fixed',
    notify: null,
    announce: true,
  },
  comida: {
    protocol: 'comida',
    priority: PRIORITY.PROCEDURE,
    defaultTimes: ['13:30'],
    defaultDuration: 45,
    defaultRoom: 'all',
    restoreOnEnd: true,
    durationMode: 'fixed',
    notify: null,
    announce: true,
  },
  merienda: {
    protocol: 'comida',
    priority: PRIORITY.PROCEDURE,
    defaultTimes: ['17:00'],
    defaultDuration: 30,
    defaultRoom: 'all',
    restoreOnEnd: true,
    durationMode: 'fixed',
    notify: null,
    announce: true,
  },
  cena: {
    protocol: 'comida',
    priority: PRIORITY.PROCEDURE,
    defaultTimes: ['20:30'],
    defaultDuration: 45,
    defaultRoom: 'all',
    restoreOnEnd: true,
    durationMode: 'fixed',
    notify: null,
    announce: true,
  },
  medicacion: {
    protocol: 'medicacion',
    priority: PRIORITY.PROCEDURE,
    defaultTimes: ['09:00', '15:00', '21:00'],
    defaultDuration: 20,
    defaultRoom: 'all',
    restoreOnEnd: true,
    durationMode: 'fixed',
    notify: 'media',
    announce: true,
  },
  cura: {
    protocol: 'cura',
    priority: PRIORITY.PROCEDURE,
    defaultTimes: ['11:00'],
    defaultDuration: 30,
    defaultRoom: '205',
    restoreOnEnd: true,
    durationMode: 'fixed',
    notify: 'media',
    announce: true,
  },
  visita: {
    protocol: 'visita',
    priority: PRIORITY.THERAPEUTIC,
    defaultTimes: ['18:00'],
    defaultDuration: 90,
    defaultRoom: 'all',
    restoreOnEnd: true,
    durationMode: 'fixed',
    notify: null,
    announce: true,
  },
  descanso: {
    protocol: 'noche',
    priority: PRIORITY.SLEEP,
    defaultTimes: ['22:00'],
    defaultDuration: 30,
    defaultRoom: 'all',
    restoreOnEnd: false,
    durationMode: 'untilMorning',
    notify: null,
    announce: true,
  },
  despertar: {
    protocol: 'manana',
    priority: PRIORITY.THERAPEUTIC,
    defaultTimes: ['07:00'],
    defaultDuration: 30,
    defaultRoom: 'all',
    restoreOnEnd: false,
    durationMode: 'none',
    notify: null,
    announce: true,
  },
  constantes: {
    protocol: 'medicacion',
    priority: PRIORITY.PROCEDURE,
    defaultTimes: ['08:00', '16:00'],
    defaultDuration: 15,
    defaultRoom: 'all',
    restoreOnEnd: true,
    durationMode: 'fixed',
    notify: 'baja',
    announce: false,
  },
};

/** Agenda inicial de la planta (en memoria). */
export function defaultTriggers(): Trigger[] {
  const list: Trigger[] = [];
  for (const [type, profile] of Object.entries(TRIGGER_PROFILES) as [
    TriggerType,
    TriggerProfile,
  ][]) {
    for (const time of profile.defaultTimes) {
      list.push({
        id: newId('trg'),
        type,
        roomId: profile.defaultRoom,
        time,
        repeat: 'daily',
        durationMin: profile.defaultDuration,
        enabled: true,
        params: {},
        lastFiredKey: null,
      });
    }
  }
  return list.sort((a, b) => a.time.localeCompare(b.time));
}
