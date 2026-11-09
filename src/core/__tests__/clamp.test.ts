import { describe, expect, it } from 'vitest';
import { clampValues, DEVICE_RANGES, rulesFor } from '../policy/protocols';
import { rampValues } from '../state';
import { runTool, toToolDefinitions, TOOLS } from '../tools';
import { PRIORITY } from '../types';
import { call, testStore } from './helpers';

describe('clamp de rangos', () => {
  it('recorta los argumentos fuera del rango del dispositivo y lo indica', () => {
    const store = testStore();
    const result = runTool(call('set_temperature', { room: '202', value: 35 }), store);
    expect(result.ok).toBe(true);
    expect(store.getState().rooms['202']?.target?.tempC).toBe(28);
    if (result.ok) expect((result.result as { clamped: string[] }).clamped).toHaveLength(1);

    runTool(call('set_light', { room: '202', pct: -20, kelvin: 9000 }), store);
    expect(store.getState().rooms['202']?.target?.lightPct).toBe(0);
    expect(store.getState().rooms['202']?.target?.kelvin).toBe(6500);
  });

  it('el agente respeta los rangos de la categoría; la orden manual no', () => {
    const store = testStore();
    // 201 es categoría A; a las 08:20 está en protocolo «mañana» (luz 30–65 %, 2700–3500 K).
    const room = store.getState().rooms['201'];
    expect(room?.category).toBe('A');
    expect(room?.protocol).toBe('manana');
    const ranges = rulesFor('A', 'manana').ranges;

    runTool(
      call('set_light', { room: '201', pct: 100, kelvin: 6500 }, PRIORITY.THERAPEUTIC, {
        source: 'agent',
      }),
      store,
    );
    expect(store.getState().rooms['201']?.target?.lightPct).toBe(ranges.lightPct[1]);
    expect(store.getState().rooms['201']?.target?.kelvin).toBe(ranges.kelvin[1]);

    runTool(call('set_light', { room: '201', pct: 100 }), store);
    expect(store.getState().rooms['201']?.target?.lightPct).toBe(100);
  });

  it('la cura impone luz de trabajo 100 % a 4000 K para cualquier categoría', () => {
    for (const category of ['A', 'B', 'C'] as const) {
      const r = rulesFor(category, 'cura').ranges;
      expect(r.lightPct).toEqual([100, 100]);
      expect(r.kelvin).toEqual([4000, 4000]);
      expect(r.soundPct).toEqual([0, 0]);
    }
  });

  it('clampValues redondea y limita a los rangos', () => {
    const v = clampValues(
      {
        tempC: 40.123,
        lightPct: 50.6,
        kelvin: 1000,
        soundPct: 101,
        soundscape: 'lluvia',
        aromaOn: true,
        aromaPct: -3,
        aromaType: 'lavanda',
      },
      DEVICE_RANGES,
    );
    expect(v).toMatchObject({ tempC: 28, lightPct: 51, kelvin: 2200, soundPct: 100, aromaPct: 0 });
  });

  it('runTool nunca lanza: argumentos inválidos o función desconocida devuelven ok:false', () => {
    const store = testStore();
    expect(runTool(call('set_temperature', { room: '202' }), store).ok).toBe(false);
    expect(runTool(call('set_temperature', { room: '299', value: 22 }), store).ok).toBe(false);
    expect(runTool(call('borrar_todo', {}), store).ok).toBe(false);
    expect(runTool(call('set_light', { room: '202', pct: 'mucho' }), store).ok).toBe(false);
  });

  it('el JSON Schema publica los rangos como minimum/maximum', () => {
    const defs = toToolDefinitions();
    expect(defs).toHaveLength(TOOLS.length);
    for (const def of defs) expect(def.input_schema.type).toBe('object');
    const temp = defs.find((d) => d.name === 'set_temperature');
    const value = (temp?.input_schema.properties as Record<string, Record<string, unknown>>).value;
    expect(value).toMatchObject({ type: 'number', minimum: 18, maximum: 28 });
  });

  it('la rampa avanza un 15 % de la distancia por paso', () => {
    const base = {
      tempC: 20,
      lightPct: 0,
      kelvin: 3000,
      soundPct: 0,
      soundscape: 'silencio' as const,
      aromaOn: false,
      aromaPct: 0,
      aromaType: 'lavanda' as const,
    };
    const { values, done } = rampValues(base, { ...base, lightPct: 100 }, 1);
    expect(values.lightPct).toBeCloseTo(15);
    expect(done).toBe(false);
  });
});
