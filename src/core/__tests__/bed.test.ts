import { describe, expect, it } from 'vitest';
import { makeEvent } from '../agent';
import { SAMPLE_FORMS } from '../classify';
import { buildContextSummary } from '../planners';
import { BED_LIMITS, bedGoal } from '../policy/bed';
import { createEngine } from '../scheduler';
import { setSpeed, tickRooms, type AppStore } from '../state';
import { runTool } from '../tools';
import { BED_RESTRICTIONS, PRIORITY, type BedRestriction, type Room } from '../types';
import { at, call, testAgent, testStore, trigger } from './helpers';

const ROOM = '204';

function roomOf(store: AppStore, id = ROOM): Room {
  const room = store.getState().rooms[id];
  if (!room) throw new Error(`sin habitación ${id}`);
  return room;
}

/** Ingresa en la 204 (libre) un paciente con la lesión indicada. */
function admitWith(restriction: BedRestriction): AppStore {
  const store = testStore();
  const form = { ...SAMPLE_FORMS.A, bedRestriction: restriction };
  expect(runTool(call('admit_patient', { room: ROOM, form }), store).ok).toBe(true);
  return store;
}

/** Deja pasar `seconds` segundos simulados, un tick por segundo. */
function wait(store: AppStore, seconds = 90): void {
  let now = store.getState().clock.nowMin;
  for (let i = 0; i < seconds; i += 1) {
    now += 1 / 60;
    const n = now;
    store.setState((s) => tickRooms({ ...s, clock: { ...s.clock, nowMin: n } }, n, 1, 1 / 60));
  }
}

const setBed = (store: AppStore, args: Record<string, unknown>) =>
  runTool(call('set_bed', { room: ROOM, ...args }), store);

describe('cama articulada', () => {
  it('sin lesión se incorpora y se estira con rampa, sin saltos', () => {
    const store = admitWith('ninguna');
    expect(roomOf(store).bed).toEqual({ backrestDeg: 30, targetDeg: null });

    expect(setBed(store, { position: 'incorporada' }).ok).toBe(true);
    // El objetivo cambia; el respaldo todavía no se ha movido.
    expect(roomOf(store).bed).toEqual({ backrestDeg: 30, targetDeg: 60 });
    wait(store, 1);
    expect(roomOf(store).bed.backrestDeg).toBeCloseTo(34.5);
    wait(store);
    expect(roomOf(store).bed).toEqual({ backrestDeg: 60, targetDeg: null });

    expect(setBed(store, { position: 'plana' }).ok).toBe(true);
    wait(store);
    expect(roomOf(store).bed).toEqual({ backrestDeg: 0, targetDeg: null });
  });

  it('una lesión de columna impide incorporar: la orden se rechaza y queda registrada', () => {
    const store = admitWith('columna');
    // Al ingresar, la cama se prepara ya en plano.
    expect(roomOf(store).bed.targetDeg).toBe(0);
    wait(store);
    expect(roomOf(store).bed).toEqual({ backrestDeg: 0, targetDeg: null });

    const result = setBed(store, { position: 'incorporada' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/No se puede incorporar.*lesión/);
    expect(setBed(store, { deg: 20 }).ok).toBe(false);
    expect(setBed(store, { deltaDeg: 5 }).ok).toBe(false);
    expect(roomOf(store).bed).toEqual({ backrestDeg: 0, targetDeg: null });

    const rejected = roomOf(store).log.find((entry) => !entry.ok);
    expect(rejected?.detail).toMatch(/fijo a 0°/);
    // Pedir la posición que ya tiene no es un error.
    expect(setBed(store, { position: 'plana' }).ok).toBe(true);
  });

  it('una lesión de cadera deja incorporar solo hasta el límite', () => {
    const store = admitWith('cadera');
    const result = setBed(store, { position: 'incorporada' });
    expect(result).toMatchObject({
      ok: true,
      result: { backrestDeg: 45, limited: true, allowedRange: [0, 45] },
    });
    expect(roomOf(store).bed.targetDeg).toBe(45);
    expect(roomOf(store).log.some((entry) => /Cama limitada a 45°/.test(entry.action))).toBe(true);

    // Ya está en el límite: insistir se rechaza.
    expect(setBed(store, { deg: 70 }).ok).toBe(false);
    // Dentro del rango se mueve con normalidad.
    expect(setBed(store, { deg: 20 })).toMatchObject({
      ok: true,
      result: { backrestDeg: 20, limited: false },
    });
  });

  it('con riesgo de aspiración la cama no se puede estirar por debajo de 30°', () => {
    const store = admitWith('respiratoria');
    const flat = setBed(store, { position: 'plana' });
    expect(flat.ok).toBe(false);
    if (!flat.ok) expect(flat.error).toMatch(/No se puede estirar.*entre 30° y 70°/);

    expect(setBed(store, { position: 'incorporada' }).ok).toBe(true);
    expect(setBed(store, { position: 'plana' })).toMatchObject({
      ok: true,
      result: { backrestDeg: 30, limited: true },
    });
  });

  it('con el cabecero fijo no se puede ni incorporar ni estirar', () => {
    const store = admitWith('craneal');
    expect(setBed(store, { position: 'incorporada' }).ok).toBe(false);
    expect(setBed(store, { position: 'plana' }).ok).toBe(false);
    expect(setBed(store, { deltaDeg: -10 }).ok).toBe(false);
    expect(roomOf(store).bed).toEqual({ backrestDeg: 30, targetDeg: null });
  });

  it('ninguna orden, venga de donde venga, saca la cama del rango que admite la lesión', () => {
    const requests: Record<string, unknown>[] = [
      { position: 'plana' },
      { position: 'semi' },
      { position: 'incorporada' },
      { deg: 0 },
      { deg: 70 },
      { deg: 999 },
      { deg: -50 },
      { deltaDeg: 70 },
      { deltaDeg: -70 },
      { deltaDeg: 5 },
    ];
    const origins = [
      [PRIORITY.MANUAL, 'manual'],
      [PRIORITY.MANUAL, 'voice'],
      [PRIORITY.MANUAL, 'llm'],
      [PRIORITY.SAFETY, 'agent'],
      [PRIORITY.THERAPEUTIC, 'agent'],
    ] as const;

    for (const restriction of BED_RESTRICTIONS) {
      const store = admitWith(restriction);
      const [min, max] = BED_LIMITS[restriction];
      for (const [priority, source] of origins) {
        for (const args of requests) {
          runTool(call('set_bed', { room: ROOM, ...args }, priority, { source }), store);
          wait(store, 2);
          const goal = bedGoal(roomOf(store).bed);
          expect(goal, `${restriction} ${JSON.stringify(args)}`).toBeGreaterThanOrEqual(min);
          expect(goal, `${restriction} ${JSON.stringify(args)}`).toBeLessThanOrEqual(max);
        }
      }
      wait(store);
      expect(roomOf(store).bed.backrestDeg).toBeGreaterThanOrEqual(min);
      expect(roomOf(store).bed.backrestDeg).toBeLessThanOrEqual(max);
    }
  });

  it('indicar una lesión nueva en el formulario lleva la cama al límite permitido', () => {
    const store = admitWith('ninguna');
    setBed(store, { position: 'incorporada' });
    wait(store);
    expect(roomOf(store).bed.backrestDeg).toBe(60);

    const form = { ...SAMPLE_FORMS.A, bedRestriction: 'columna' as const };
    expect(runTool(call('classify_patient', { room: ROOM, form }), store).ok).toBe(true);
    expect(roomOf(store).bed.targetDeg).toBe(0);
    expect(roomOf(store).log.some((entry) => /Cama llevada a 0°/.test(entry.action))).toBe(true);
    wait(store);
    expect(roomOf(store).bed).toEqual({ backrestDeg: 0, targetDeg: null });
  });

  it('los protocolos y los disparadores no mueven la cama', async () => {
    const store = testStore({
      nowMin: at('13:29'),
      triggers: [trigger({ type: 'comida', time: '13:30', durationMin: 45 })],
    });
    store.setState((s) => setSpeed(s, 60));
    const before = roomOf(store, '201').bed;
    const engine = createEngine({ store, agent: testAgent(store) });

    await engine.tick(1);
    expect(roomOf(store, '201').protocol).toBe('comida');
    await engine.jumpTo('22:30');
    expect(roomOf(store, '201').protocol).toBe('noche');
    runTool(call('apply_protocol', { room: '201', protocol: 'cura' }), store);

    expect(roomOf(store, '201').bed).toEqual(before);
  });

  it('durante una alarma clínica no se mueve por orden manual; al terminar, sí', async () => {
    const store = testStore();
    const agent = testAgent(store);
    const now = store.getState().clock.nowMin;
    await agent.handle(makeEvent('manual', { action: 'simulateAlarm', room: '201' }, now));

    const blocked = runTool(call('set_bed', { room: '201', position: 'plana' }), store);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toMatch(/Bloqueado/);

    const later = now + 11;
    store.setState((s) =>
      tickRooms({ ...s, clock: { ...s.clock, nowMin: later } }, later, 1, 11),
    );
    expect(runTool(call('set_bed', { room: '201', position: 'plana' }), store).ok).toBe(true);
  });

  it('el agente de IA conoce el rango permitido, no la lesión ni el nombre del paciente', () => {
    const store = testStore();
    const state = store.getState();
    const context = buildContextSummary({
      event: makeEvent('voice', { text: 'hola' }, 0),
      state,
      nowMin: state.clock.nowMin,
    });
    const rooms = context.habitaciones as { id: string; cama?: unknown }[];
    expect(rooms.find((r) => r.id === '205')?.cama).toEqual({ respaldo: 30, permitido: [0, 45] });
    expect(rooms.find((r) => r.id === '203')?.cama).toEqual({ respaldo: 30, permitido: [30, 70] });

    const sent = JSON.stringify(context);
    expect(sent).not.toMatch(/bedRestriction|columna|cadera|respiratoria|craneal/);
    for (const form of Object.values(SAMPLE_FORMS)) expect(sent).not.toContain(form.name);

    // El rechazo que vuelve al modelo como resultado tampoco nombra la lesión.
    const rejected = runTool(
      call('set_bed', { room: '203', position: 'plana' }, PRIORITY.MANUAL, { source: 'llm' }),
      store,
    );
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error).not.toMatch(/respiratoria|aspiración/i);
  });

  it('por voz: incorpora hasta el límite y lo explica; si la lesión lo impide, lo dice', async () => {
    const store = testStore();
    const agent = testAgent(store);

    const up = await agent.handle(makeEvent('voice', { text: 'incorpora la cama de la 205' }, 0));
    expect(up.calls[0]).toMatchObject({
      name: 'set_bed',
      args: { room: '205', position: 'incorporada' },
    });
    expect(roomOf(store, '205').bed.targetDeg).toBe(45);
    expect(up.reply).toMatch(/45°.*límite/);
    // La cama no es ambiente: moverla no desactiva el Modo IA.
    expect(roomOf(store, '205').auto).toBe(true);

    const flat = await agent.handle(makeEvent('voice', { text: 'estira la cama de la 203' }, 0));
    expect(flat.results[0]?.ok).toBe(false);
    expect(flat.reply).toMatch(/No he podido.*No se puede estirar/);
    expect(roomOf(store, '203').bed).toEqual({ backrestDeg: 30, targetDeg: null });
  });
});
