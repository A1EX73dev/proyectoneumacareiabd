import { describe, expect, it } from 'vitest';
import { extractTime, interpret, normalize, wordsToNumbers, type InterpretContext } from '../voice';
import { trigger } from './helpers';

const med = trigger({ type: 'medicacion', time: '15:00' });
const ctx: InterpretContext = {
  selectedRoom: '205',
  triggers: [med],
  occupiedRooms: ['201', '205'],
};

function first(text: string, c: InterpretContext = ctx) {
  const r = interpret(text, c);
  expect(r.clarification).toBeNull();
  return r.calls[0];
}

describe('números en palabras', () => {
  it.each([
    ['doscientos cinco', '205'],
    ['veintitres', '23'],
    ['cuarenta y cinco', '45'],
    ['veinte por ciento', '20 por ciento'],
    ['catorce', '14'],
    ['cien', '100'],
  ])('%s → %s', (input, expected) => {
    expect(wordsToNumbers(input)).toBe(expected);
  });

  it('normaliza tildes, signos y porcentajes', () => {
    expect(normalize('¿Qué estado tiene la 203?')).toBe('que estado tiene la 203');
    expect(normalize('Baja la luz al 20%')).toBe('baja la luz al 20 por ciento');
  });
});

describe('intérprete de comandos (texto → ToolCall[])', () => {
  it.each([
    ['abre la habitación 205', 'open_room', { room: '205' }],
    ['sube la temperatura a 23', 'set_temperature', { room: '205', value: 23 }],
    ['baja la luz al 20 por ciento', 'set_light', { room: '205', pct: 20 }],
    ['luz más cálida', 'set_light', { room: '205', deltaKelvin: -500 }],
    ['pon el protocolo de noche', 'apply_protocol', { room: '205', protocol: 'noche' }],
    ['activa el modo IA', 'set_auto_mode', { room: '205', on: true }],
    ['desactiva el aroma', 'set_aroma', { room: '205', on: false }],
    ['pon sonido de lluvia', 'set_sound', { room: '205', soundscape: 'lluvia' }],
    [
      'programa la medicación a las 14:00 en la 202',
      'schedule_trigger',
      { type: 'medicacion', time: '14:00', room: '202' },
    ],
    ['avisa a enfermería', 'notify_staff', { room: '205', urgency: 'media' }],
    ['qué estado tiene la 203', 'get_room_state', { room: '203' }],
    ['sube la temperatura a veintitrés grados', 'set_temperature', { room: '205', value: 23 }],
    ['baja la luz al veinte por ciento en la 201', 'set_light', { room: '201', pct: 20 }],
    ['abre la habitación doscientos tres', 'open_room', { room: '203' }],
    ['tengo frío', 'set_temperature', { room: '205', delta: 1 }],
    ['pon la luz a 3000 kelvin', 'set_light', { room: '205', kelvin: 3000 }],
    ['desactiva el modo automático en la 201', 'set_auto_mode', { room: '201', on: false }],
    ['avisa urgente a la enfermera', 'notify_staff', { urgency: 'alta' }],
    ['sube la persiana', 'set_blinds', { room: '205', pct: 100 }],
    ['baja la persiana de la 203', 'set_blinds', { room: '203', pct: 0 }],
    ['cierra las persianas', 'set_blinds', { room: '205', pct: 0 }],
    ['persiana al 40 por ciento', 'set_blinds', { room: '205', pct: 40 }],
    ['baja un poco la persiana', 'set_blinds', { room: '205', deltaPct: -25 }],
    ['pon la persiana a la mitad', 'set_blinds', { room: '205', pct: 50 }],
    ['incorpora la cama', 'set_bed', { room: '205', position: 'incorporada' }],
    ['estira la camilla de la 201', 'set_bed', { room: '201', position: 'plana' }],
    ['pon la cama a cuarenta y cinco grados', 'set_bed', { room: '205', deg: 45 }],
    ['sube un poco el cabecero', 'set_bed', { room: '205', deltaDeg: 15 }],
    ['deja la cama semiincorporada', 'set_bed', { room: '205', position: 'semi' }],
    ['incorpórame un poco', 'set_bed', { room: '205', deltaDeg: 15 }],
    ['quiero tumbarme', 'set_bed', { room: '205', position: 'plana' }],
  ])('«%s» → %s', (text, name, args) => {
    const c = first(text);
    expect(c?.name).toBe(name);
    expect(c?.args).toMatchObject(args);
  });

  it('«abre la persiana de la 201» mueve la persiana, no abre la habitación', () => {
    expect(first('abre la persiana de la 201')).toMatchObject({
      name: 'set_blinds',
      args: { room: '201', pct: 100 },
    });
    expect(first('abre la habitación 201')?.name).toBe('open_room');
  });

  it('«sube» y «baja» se aplican al dispositivo que se nombra, no a la cama por estar en la frase', () => {
    expect(first('sube la temperatura, estoy en la cama')).toMatchObject({
      name: 'set_temperature',
      args: { delta: 1 },
    });
    expect(first('tengo frío en la cama')?.name).toBe('set_temperature');
    expect(first('baja la luz, que la persiana está abierta')?.name).toBe('set_light');
    expect(first('sube la persiana para que entre luz')?.name).toBe('set_blinds');
  });

  it('una frase que no es una orden de postura no mueve la cama', () => {
    for (const text of ['el paciente se siente mal', 'está acostumbrado al ruido']) {
      const r = interpret(text, ctx);
      expect(r.calls).toHaveLength(0);
      expect(r.clarification).toBeTruthy();
    }
  });

  it('entiende horas habladas', () => {
    expect(first('programa la cena a las nueve de la noche')?.args).toMatchObject({
      time: '21:00',
    });
    expect(extractTime('a las 9 y media')?.time).toBe('09:30');
    expect(extractTime('a la una de la tarde')?.time).toBe('13:00');
  });

  it('cancela un disparador existente por tipo y hora', () => {
    expect(first('cancela la medicación de las 15:00')).toMatchObject({
      name: 'cancel_trigger',
      args: { id: med.id },
    });
  });

  it('admite órdenes compuestas', () => {
    const r = interpret('baja la luz al 30 por ciento y pon sonido de olas', ctx);
    expect(r.calls.map((c) => c.name)).toEqual(['set_light', 'set_sound']);
    const both = interpret('baja la persiana e incorpora la cama', ctx);
    expect(both.calls.map((c) => c.name)).toEqual(['set_blinds', 'set_bed']);
  });

  it('«activa el modo IA» sin sala abierta lo aplica a todas las ocupadas', () => {
    const r = interpret('activa el modo IA', { ...ctx, selectedRoom: null });
    expect(r.calls).toHaveLength(2);
  });

  it('pide aclaración corta si falta la habitación o no entiende', () => {
    const noRoom = interpret('sube la temperatura a 23', { ...ctx, selectedRoom: null });
    expect(noRoom.calls).toHaveLength(0);
    expect(noRoom.clarification).toMatch(/habitación/);
    const unknown = interpret('cuéntame un chiste', ctx);
    expect(unknown.calls).toHaveLength(0);
    expect(unknown.clarification).toBeTruthy();
    expect(interpret('programa la comida', ctx).clarification).toMatch(/hora/);
  });
});
