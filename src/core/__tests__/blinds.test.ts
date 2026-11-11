import { describe, expect, it } from 'vitest';
import { makeEvent } from '../agent';
import { resolveProtocol } from '../policy/protocols';
import { createEngine } from '../scheduler';
import { luxFor, setSpeed, type AppStore } from '../state';
import { runTool } from '../tools';
import { CATEGORY_IDS, PRIORITY, type Room } from '../types';
import { at, call, testAgent, testStore } from './helpers';

function roomOf(store: AppStore, id: string): Room {
  const room = store.getState().rooms[id];
  if (!room) throw new Error(`sin habitación ${id}`);
  return room;
}

describe('persiana eléctrica', () => {
  it('se mueve con rampa y, como cualquier ajuste manual, desactiva el Modo IA', () => {
    const store = testStore();
    const before = roomOf(store, '202').values.blindsPct;
    expect(before).toBeGreaterThan(0);

    expect(runTool(call('set_blinds', { room: '202', pct: 0 }), store).ok).toBe(true);
    const room = roomOf(store, '202');
    expect(room.target?.blindsPct).toBe(0);
    expect(room.values.blindsPct).toBe(before);
    expect(room.auto).toBe(false);
    expect(room.override?.priority).toBe(PRIORITY.MANUAL);
  });

  it('admite cambios relativos y recorta al recorrido de la persiana', () => {
    const store = testStore();
    runTool(call('set_blinds', { room: '202', pct: 40 }), store);
    runTool(call('set_blinds', { room: '202', deltaPct: 25 }), store);
    expect(roomOf(store, '202').target?.blindsPct).toBe(65);
    runTool(call('set_blinds', { room: '202', deltaPct: 80 }), store);
    expect(roomOf(store, '202').target?.blindsPct).toBe(100);

    const result = runTool(call('set_blinds', { room: '202', pct: -30 }), store);
    expect(roomOf(store, '202').target?.blindsPct).toBe(0);
    if (result.ok) expect((result.result as { clamped: string[] }).clamped).toHaveLength(1);

    expect(runTool(call('set_blinds', { room: '202' }), store).ok).toBe(false);
  });

  it('de noche los protocolos la bajan y por la mañana la suben según la categoría', () => {
    for (const category of CATEGORY_IDS) {
      expect(resolveProtocol('noche', category, null).blindsPct).toBe(0);
    }
    expect(resolveProtocol('manana', 'B', null).blindsPct).toBe(100);
    expect(resolveProtocol('manana', 'C', null).blindsPct).toBe(100);
    // Categoría A: luz natural tamizada.
    expect(resolveProtocol('manana', 'A', null).blindsPct).toBe(60);
  });

  it('el agente respeta el rango de la categoría; la orden manual no', () => {
    const store = testStore();
    expect(roomOf(store, '201').category).toBe('A');
    runTool(
      call('set_blinds', { room: '201', pct: 100 }, PRIORITY.THERAPEUTIC, { source: 'agent' }),
      store,
    );
    expect(roomOf(store, '201').target?.blindsPct).toBe(70);
    runTool(call('set_blinds', { room: '201', pct: 100 }), store);
    expect(roomOf(store, '201').target?.blindsPct).toBe(100);
  });

  it('la luz natural que entra depende de la persiana', () => {
    const base = resolveProtocol('neutro', null, null);
    const open = { ...base, blindsPct: 100 };
    const closed = { ...base, blindsPct: 0 };
    expect(luxFor(open, at('12:00')) - luxFor(closed, at('12:00'))).toBeCloseTo(150);
    expect(luxFor(open, at('23:00'))).toBe(luxFor(closed, at('23:00')));
  });

  it('tras una cura la persiana vuelve sola a donde estaba', async () => {
    const store = testStore({ nowMin: at('10:30') });
    store.setState((s) => setSpeed(s, 60));
    const agent = testAgent(store);
    const before = roomOf(store, '205').values.blindsPct;

    await agent.handle(
      makeEvent('manual', { action: 'simulateCura', room: '205', durationMin: 15 }, at('10:30')),
    );
    expect(roomOf(store, '205').target?.blindsPct).toBe(30);

    await createEngine({ store, agent }).tick(16);
    const room = roomOf(store, '205');
    expect((room.target ?? room.values).blindsPct).toBe(before);
  });

  it('a las 22:00 el agente baja las persianas y a las 06:00 las vuelve a subir', async () => {
    const store = testStore({ nowMin: at('21:59') });
    store.setState((s) => setSpeed(s, 60));
    const engine = createEngine({ store, agent: testAgent(store) });

    await engine.tick(1);
    expect(roomOf(store, '203').protocol).toBe('noche');
    expect(roomOf(store, '203').target?.blindsPct).toBe(0);

    await engine.jumpTo('06:00');
    expect(roomOf(store, '203').protocol).toBe('manana');
    expect(roomOf(store, '203').target?.blindsPct).toBe(100);
  });

  it('por voz: «baja la persiana de la 202» y lo confirma', async () => {
    const store = testStore();
    const run = await testAgent(store).handle(
      makeEvent('voice', { text: 'baja la persiana de la 202' }, 0),
    );
    expect(run.calls[0]).toMatchObject({ name: 'set_blinds', args: { room: '202', pct: 0 } });
    expect(roomOf(store, '202').target?.blindsPct).toBe(0);
    expect(run.reply).toBe('Persiana de la 202 al 0 %.');
  });
});
