import { describe, expect, it } from 'vitest';
import { makeEvent } from '../agent';
import { createEngine, dueTriggers, markFired } from '../scheduler';
import { occupiedRoomIds, setSpeed } from '../state';
import { at, testAgent, testStore, trigger } from './helpers';

describe('scheduler: una sola vez por ventana', () => {
  const comida = trigger({ type: 'comida', time: '13:30', durationMin: 45 });

  it('dispara al entrar en la ventana y no repite dentro de ella', () => {
    let triggers = [comida];
    const first = dueTriggers(triggers, at('13:29'), at('13:30'));
    expect(first).toHaveLength(1);
    triggers = markFired(triggers, first);
    expect(dueTriggers(triggers, at('13:30'), at('13:31'))).toHaveLength(0);
    expect(dueTriggers(triggers, at('13:31'), at('14:10'))).toHaveLength(0);
  });

  it('no dispara antes de la hora ni después de la ventana', () => {
    expect(dueTriggers([comida], at('13:00'), at('13:29'))).toHaveLength(0);
    expect(dueTriggers([comida], at('14:16'), at('14:30'))).toHaveLength(0);
  });

  it('a velocidades altas detecta la ventana aunque el tick la salte entera', () => {
    const corto = trigger({ type: 'medicacion', time: '09:00', durationMin: 5 });
    expect(dueTriggers([corto], at('08:55'), at('09:10'))).toHaveLength(1);
  });

  it('vuelve a disparar al día siguiente', () => {
    const fired = markFired([comida], dueTriggers([comida], at('13:29'), at('13:30')));
    expect(dueTriggers(fired, at('13:29', 1), at('13:30', 1))).toHaveLength(1);
  });

  it('los disparadores "once" se desactivan tras disparar', () => {
    const once = trigger({ type: 'visita', time: '18:00', repeat: 'once' });
    const fired = markFired([once], dueTriggers([once], at('17:59'), at('18:00')));
    expect(fired[0]?.enabled).toBe(false);
    expect(dueTriggers(fired, at('17:59', 1), at('18:00', 1))).toHaveLength(0);
  });

  it('los desactivados no disparan', () => {
    expect(dueTriggers([{ ...comida, enabled: false }], at('13:29'), at('13:30'))).toHaveLength(0);
  });

  it('una ventana que cruza la medianoche se reconoce al día siguiente', () => {
    const descanso = trigger({ type: 'descanso', time: '23:50', durationMin: 30 });
    expect(dueTriggers([descanso], at('00:05', 1), at('00:06', 1))).toHaveLength(1);
  });
});

describe('motor (reloj + agente)', () => {
  it('el disparador de comida aplica el protocolo en las salas ocupadas una sola vez', async () => {
    const store = testStore({
      nowMin: at('13:29'),
      triggers: [trigger({ type: 'comida', time: '13:30', durationMin: 45 })],
    });
    store.setState((s) => setSpeed(s, 60));
    const engine = createEngine({ store, agent: testAgent(store) });
    await engine.tick(1);
    await engine.tick(1);
    await engine.tick(1);
    const state = store.getState();
    const occupied = occupiedRoomIds(state);
    for (const id of occupied) expect(state.rooms[id]?.protocol).toBe('comida');
    const applied = state.agent.calls.filter(
      (c) => c.call.name === 'apply_protocol' && c.call.args.protocol === 'comida',
    );
    expect(applied).toHaveLength(occupied.length);
  });

  it('a las 06:00 el agente aplica la activación matinal', async () => {
    const store = testStore({ nowMin: at('05:59', 1) });
    expect(store.getState().rooms['202']?.protocol).toBe('noche');
    store.setState((s) => setSpeed(s, 60));
    const engine = createEngine({ store, agent: testAgent(store) });
    await engine.tick(1);
    const room = store.getState().rooms['202'];
    expect(room?.protocol).toBe('manana');
    expect(room?.log[0]?.reason).toMatch(/Activación matinal/);
  });

  it('jumpTo("06:00") desde la tarde también activa la mañana', async () => {
    const store = testStore({ nowMin: at('16:00') });
    const engine = createEngine({ store, agent: testAgent(store) });
    await engine.jumpTo('06:00');
    expect(store.getState().clock.nowMin).toBe(at('06:00', 1));
    expect(store.getState().rooms['203']?.protocol).toBe('manana');
  });

  it('la cura cambia con rampa y restablece el estado previo al terminar', async () => {
    const store = testStore({ nowMin: at('10:30') });
    store.setState((s) => setSpeed(s, 60));
    const agent = testAgent(store);
    const before = store.getState().rooms['205'];
    const prevProtocol = before?.protocol;
    const prevLight = before?.values.lightPct;

    await agent.handle(
      makeEvent('manual', { action: 'simulateCura', room: '205', durationMin: 15 }, at('10:30')),
    );
    let room = store.getState().rooms['205'];
    expect(room?.protocol).toBe('cura');
    expect(room?.target?.lightPct).toBe(100);
    expect(room?.target?.kelvin).toBe(4000);
    expect(room?.values.lightPct).toBe(prevLight); // sin salto

    const engine = createEngine({ store, agent });
    await engine.tick(16);
    room = store.getState().rooms['205'];
    expect(room?.protocol).toBe(prevProtocol);
    expect((room?.target ?? room?.values)?.lightPct).toBe(prevLight);
    expect(room?.log.some((l) => /Fin de «Cura»/.test(l.action))).toBe(true);
  });

  it('el descanso protege el sueño hasta las 06:00 y bloquea acciones terapéuticas', async () => {
    const store = testStore({
      nowMin: at('21:59'),
      triggers: [trigger({ type: 'descanso', time: '22:00', durationMin: 30 })],
    });
    store.setState((s) => setSpeed(s, 60));
    const agent = testAgent(store);
    const engine = createEngine({ store, agent });
    await engine.tick(1);
    const room = store.getState().rooms['202'];
    expect(room?.protocol).toBe('noche');
    expect(room?.override?.priority).toBe(4);
    expect(room?.override?.endMin).toBe(at('06:00', 1));
  });
});
