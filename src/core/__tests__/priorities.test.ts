import { describe, expect, it } from 'vitest';
import { checkPriority } from '../policy/priorities';
import { runTool } from '../tools';
import { PRIORITY, type Override } from '../types';
import { call, testStore } from './helpers';

const override = (priority: Override['priority'], endMin: number | null = 100): Override => ({
  priority,
  source: 'trigger',
  label: 'Cura',
  eventId: 'ev-1',
  startMin: 0,
  endMin,
  restore: null,
});

describe('jerarquía de prioridades (checkPriority)', () => {
  it('sin evento activo, cualquier prioridad actúa', () => {
    expect(checkPriority(null, PRIORITY.NEUTRAL, 10).allowed).toBe(true);
  });

  it('una prioridad menor nunca anula a una mayor', () => {
    const cura = override(PRIORITY.PROCEDURE);
    expect(checkPriority(cura, PRIORITY.SLEEP, 10).allowed).toBe(false);
    expect(checkPriority(cura, PRIORITY.THERAPEUTIC, 10).allowed).toBe(false);
    expect(checkPriority(cura, PRIORITY.NEUTRAL, 10).allowed).toBe(false);
  });

  it('una prioridad igual o mayor sí actúa', () => {
    const cura = override(PRIORITY.PROCEDURE);
    expect(checkPriority(cura, PRIORITY.PROCEDURE, 10).allowed).toBe(true);
    expect(checkPriority(cura, PRIORITY.MANUAL, 10).allowed).toBe(true);
    expect(checkPriority(cura, PRIORITY.SAFETY, 10).allowed).toBe(true);
  });

  it('las llamadas del mismo evento no se bloquean entre sí', () => {
    expect(checkPriority(override(PRIORITY.SAFETY), PRIORITY.NEUTRAL, 10, 'ev-1').allowed).toBe(
      true,
    );
  });

  it('un evento vencido ya no bloquea', () => {
    expect(checkPriority(override(PRIORITY.SAFETY, 50), PRIORITY.NEUTRAL, 60).allowed).toBe(true);
  });

  it('el motivo del bloqueo es legible', () => {
    const check = checkPriority(override(PRIORITY.PROCEDURE), PRIORITY.THERAPEUTIC, 10);
    expect(check.reason).toMatch(/Cura/);
  });
});

describe('jerarquía de prioridades aplicada por runTool', () => {
  it('procedimiento > terapéutica/sueño; manual > procedimiento; seguridad > manual', () => {
    const store = testStore();
    const cura = runTool(
      call(
        'apply_protocol',
        { room: '202', protocol: 'cura', durationMin: 30, restoreOnEnd: true },
        PRIORITY.PROCEDURE,
        {
          source: 'trigger',
        },
      ),
      store,
    );
    expect(cura.ok).toBe(true);

    const therapeutic = runTool(
      call('set_light', { room: '202', pct: 10 }, PRIORITY.THERAPEUTIC, { source: 'agent' }),
      store,
    );
    expect(therapeutic.ok).toBe(false);
    const sleep = runTool(
      call('apply_protocol', { room: '202', protocol: 'noche' }, PRIORITY.SLEEP, {
        source: 'agent',
      }),
      store,
    );
    expect(sleep.ok).toBe(false);
    expect(store.getState().rooms['202']?.protocol).toBe('cura');

    const manual = runTool(call('set_light', { room: '202', pct: 40 }), store);
    expect(manual.ok).toBe(true);
    expect(store.getState().rooms['202']?.override?.priority).toBe(PRIORITY.MANUAL);

    const procedure = runTool(
      call('apply_protocol', { room: '202', protocol: 'comida' }, PRIORITY.PROCEDURE, {
        source: 'trigger',
      }),
      store,
    );
    expect(procedure.ok).toBe(false);

    const safety = runTool(
      call('set_light', { room: '202', pct: 100, kelvin: 4000 }, PRIORITY.SAFETY, {
        source: 'agent',
      }),
      store,
    );
    expect(safety.ok).toBe(true);
    // Seguridad: único caso sin rampa.
    expect(store.getState().rooms['202']?.values.lightPct).toBe(100);
  });

  it('los rechazos quedan en el registro de decisiones con su motivo', () => {
    const store = testStore();
    runTool(
      call(
        'apply_protocol',
        { room: '203', protocol: 'cura', durationMin: 20 },
        PRIORITY.PROCEDURE,
      ),
      store,
    );
    runTool(
      call('set_sound', { room: '203', pct: 50 }, PRIORITY.THERAPEUTIC, { reason: 'prueba' }),
      store,
    );
    const last = store.getState().rooms['203']?.log[0];
    expect(last?.ok).toBe(false);
    expect(last?.reason).toBe('prueba');
    expect(last?.detail).toMatch(/Bloqueado/);
  });

  it('un ajuste manual desactiva el Modo IA y crea una orden sin fin', () => {
    const store = testStore();
    expect(store.getState().rooms['205']?.auto).toBe(true);
    runTool(call('set_temperature', { room: '205', value: 23 }), store);
    const room = store.getState().rooms['205'];
    expect(room?.auto).toBe(false);
    expect(room?.override?.priority).toBe(PRIORITY.MANUAL);
    expect(room?.override?.endMin).toBeNull();
  });

  it('las rampas nunca saltan: el objetivo cambia, el valor actual no', () => {
    const store = testStore();
    const before = store.getState().rooms['202']?.values.lightPct;
    runTool(call('set_light', { room: '202', pct: 5 }), store);
    const room = store.getState().rooms['202'];
    expect(room?.target?.lightPct).toBe(5);
    expect(room?.values.lightPct).toBe(before);
  });
});
