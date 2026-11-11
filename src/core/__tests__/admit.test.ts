import { describe, expect, it } from 'vitest';
import { makeEvent } from '../agent';
import { SAMPLE_FORMS } from '../classify';
import { LLM_EXCLUDED_TOOLS, llmToolDefinitions } from '../planners';
import { type AppStore } from '../state';
import { runTool } from '../tools';
import { PRIORITY, type Room } from '../types';
import { at, call, testAgent, testStore } from './helpers';

function roomOf(store: AppStore, id: string): Room {
  const room = store.getState().rooms[id];
  if (!room) throw new Error(`sin habitación ${id}`);
  return room;
}

const admit = (store: AppStore, room: string, extra: Record<string, unknown> = {}) =>
  runTool(
    call('admit_patient', { room, form: SAMPLE_FORMS.C, ...extra }, PRIORITY.MANUAL),
    store,
  );

describe('ingreso de pacientes', () => {
  it('en una habitación libre el paciente entra directamente', () => {
    const store = testStore();
    expect(roomOf(store, '204').occupied).toBe(false);

    const result = admit(store, '204');
    expect(result).toMatchObject({ ok: true, result: { replaced: false, category: 'C' } });

    const room = roomOf(store, '204');
    expect(room.occupied).toBe(true);
    expect(room.patientForm).toEqual(SAMPLE_FORMS.C);
    expect(room.category).toBe('C');
    // La sala queda gestionada por el agente, con el protocolo de la hora (08:20 ⇒ mañana).
    expect(room.auto).toBe(true);
    expect(room.protocol).toBe('manana');
    expect(room.target?.lightPct).toBe(95);
  });

  it('en una habitación ocupada no se pisa al paciente sin confirmación', () => {
    const store = testStore();
    const before = roomOf(store, '201');
    expect(before.occupied).toBe(true);

    const result = admit(store, '201');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/ya está ocupada/);
    expect(roomOf(store, '201').patientForm).toEqual(before.patientForm);
    expect(roomOf(store, '201').category).toBe('A');
  });

  it('con confirmación sustituye al paciente y borra sus datos del registro de llamadas', () => {
    const store = testStore();
    runTool(call('classify_patient', { room: '202', form: SAMPLE_FORMS.B }), store);
    runTool(call('set_light', { room: '202', pct: 10 }), store);
    expect(roomOf(store, '202').auto).toBe(false);

    const result = admit(store, '202', { replace: true });
    expect(result).toMatchObject({ ok: true, result: { replaced: true, category: 'C' } });

    const room = roomOf(store, '202');
    expect(room.patientForm?.name).toBe(SAMPLE_FORMS.C.name);
    // Paciente nuevo: se libera la orden manual del anterior y vuelve el Modo IA.
    expect(room.auto).toBe(true);
    expect(room.override).toBeNull();

    const recorded = JSON.stringify(
      store.getState().agent.calls.filter((c) => c.call.args.room === '202'),
    );
    expect(recorded).not.toContain(SAMPLE_FORMS.B.name);
    expect(recorded).not.toContain('neurologia');
    expect(recorded).toContain(SAMPLE_FORMS.C.name);
  });

  it('la cama se prepara dentro de lo que permite la lesión del paciente', () => {
    const store = testStore();
    admit(store, '204');
    // El perfil C tiene una lesión de cadera: 30° está dentro de su rango.
    expect(roomOf(store, '204').bed).toEqual({ backrestDeg: 30, targetDeg: null });

    const flat = { ...SAMPLE_FORMS.C, bedRestriction: 'columna' as const };
    runTool(call('admit_patient', { room: '207', form: flat }), store);
    expect(roomOf(store, '207').bed.targetDeg).toBe(0);
  });

  it('tras el ingreso, el agente aplica el protocolo de la hora y explica por qué', async () => {
    const store = testStore({ nowMin: at('23:00') });
    admit(store, '204');
    expect(roomOf(store, '204').protocol).toBe('noche');

    const run = await testAgent(store).handle(
      makeEvent('manual', { action: 'admitted', room: '204' }, at('23:00')),
    );
    expect(run.calls[0]).toMatchObject({
      name: 'apply_protocol',
      args: { room: '204', protocol: 'noche' },
      priority: PRIORITY.SLEEP,
    });
    expect(run.calls[0]?.reason).toMatch(/ingreso de paciente/);
    // De noche el sueño queda protegido hasta las 06:00.
    expect(roomOf(store, '204').override?.endMin).toBe(at('06:00', 1));
  });

  it('no se ingresa a nadie con una alarma clínica activa en la habitación', async () => {
    const store = testStore();
    const now = store.getState().clock.nowMin;
    await testAgent(store).handle(
      makeEvent('manual', { action: 'simulateAlarm', room: '201' }, now),
    );
    const result = admit(store, '201', { replace: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/alarma clínica/);
    expect(roomOf(store, '201').patientForm?.name).toBe(SAMPLE_FORMS.A.name);
  });

  it('el formulario se valida: sin lesión indicada o con datos fuera de rango no entra', () => {
    const store = testStore();
    const { bedRestriction: _omitted, ...withoutRestriction } = SAMPLE_FORMS.C;
    expect(
      runTool(call('admit_patient', { room: '204', form: withoutRestriction }), store).ok,
    ).toBe(false);
    expect(
      runTool(call('admit_patient', { room: '204', form: { ...SAMPLE_FORMS.C, age: 400 } }), store)
        .ok,
    ).toBe(false);
    expect(roomOf(store, '204').occupied).toBe(false);
  });

  it('el agente de IA no puede ingresar pacientes', () => {
    expect(LLM_EXCLUDED_TOOLS).toContain('admit_patient');
    const offered = llmToolDefinitions().map((def) => def.name);
    expect(offered).not.toContain('admit_patient');
    expect(offered).toEqual(expect.arrayContaining(['set_blinds', 'set_bed']));
  });
});
