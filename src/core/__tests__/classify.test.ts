import { describe, expect, it } from 'vitest';
import { classifier, FEATURES, SAMPLE_FORMS } from '../classify';
import { runTool } from '../tools';
import { call, testStore } from './helpers';

describe('clasificación en 3 categorías', () => {
  it('perfil de ejemplo A (ansiedad alta, oncología) ⇒ A · Calma y confort', () => {
    const r = classifier.classify(SAMPLE_FORMS.A);
    expect(r.category).toBe('A');
    expect(r.scores.A).toBeGreaterThan(r.scores.B);
    expect(r.scores.A).toBeGreaterThan(r.scores.C);
    expect(r.params.aromaAllowed).toBe('lavanda');
  });

  it('perfil de ejemplo B (84 años, delirium alto) ⇒ B · Descanso y orientación por regla de seguridad', () => {
    const r = classifier.classify(SAMPLE_FORMS.B);
    expect(r.category).toBe('B');
    expect(r.rule).not.toBeNull();
    expect(r.params.aromaAllowed).toBeNull();
    expect(r.params.circadian).toBe('marcado');
  });

  it('perfil de ejemplo C (traumatología, buen sueño) ⇒ C · Activación y recuperación', () => {
    const r = classifier.classify(SAMPLE_FORMS.C);
    expect(r.category).toBe('C');
    expect(r.params.aromaBlocked).toBe(true);
    expect(r.rationale.some((x) => /alergia/i.test(x))).toBe(true);
  });

  it('es determinista, explicable y con confianza entre 0 y 1', () => {
    const a = classifier.classify(SAMPLE_FORMS.A);
    const b = classifier.classify(SAMPLE_FORMS.A);
    expect(a).toEqual(b);
    expect(a.confidence).toBeGreaterThan(0);
    expect(a.confidence).toBeLessThanOrEqual(1);
    expect(a.contributions).toHaveLength(FEATURES.length);
    expect(a.rationale.length).toBeGreaterThan(0);
    const total = a.contributions
      .filter((c) => c.category === 'A')
      .reduce((s, c) => s + c.points, 0);
    expect(total).toBeCloseTo(a.scores.A, 1);
  });

  it('classify_patient guarda solo en memoria y «borrar datos» los elimina (también del registro de llamadas)', () => {
    const store = testStore();
    runTool(call('classify_patient', { room: '202', form: SAMPLE_FORMS.B }), store);
    expect(store.getState().rooms['202']?.category).toBe('B');
    runTool(call('clear_patient', { room: '202' }), store);
    const room = store.getState().rooms['202'];
    expect(room?.patientForm).toBeNull();
    expect(room?.category).toBeNull();
    const recorded = store.getState().agent.calls.find((c) => c.call.name === 'classify_patient');
    expect(JSON.stringify(recorded?.call.args)).not.toContain('neurologia');
  });
});
