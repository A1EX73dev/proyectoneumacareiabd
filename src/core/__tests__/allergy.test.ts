import { describe, expect, it } from 'vitest';
import { SAMPLE_FORMS } from '../classify';
import { resolveProtocol } from '../policy/protocols';
import { tickRooms } from '../state';
import { runTool } from '../tools';
import { PRIORITY, PROTOCOL_IDS } from '../types';
import { call, testStore } from './helpers';

const allergic = {
  ...SAMPLE_FORMS.A,
  aromaAllergy: true,
  aromaAllergyText: 'Lavanda',
  wantsAroma: true,
};

describe('alergia a aromas ⇒ aroma nunca activo', () => {
  it('ningún protocolo enciende el aroma con alergia, en ninguna categoría', () => {
    for (const category of ['A', 'B', 'C'] as const) {
      for (const protocol of PROTOCOL_IDS) {
        expect(resolveProtocol(protocol, category, allergic).aromaOn).toBe(false);
      }
    }
  });

  it('set_aroma se rechaza incluso como orden manual o de seguridad', () => {
    const store = testStore();
    expect(runTool(call('classify_patient', { room: '202', form: allergic }), store).ok).toBe(true);
    expect(runTool(call('set_aroma', { room: '202', on: true, pct: 50 }), store).ok).toBe(false);
    expect(
      runTool(
        call('set_aroma', { room: '202', on: true }, PRIORITY.SAFETY, { source: 'agent' }),
        store,
      ).ok,
    ).toBe(false);
    expect(store.getState().rooms['202']?.values.aromaOn).toBe(false);
  });

  it('clasificar con alergia apaga un aroma que estaba encendido', () => {
    const store = testStore();
    expect(runTool(call('set_aroma', { room: '206', on: true, pct: 40 }), store).ok).toBe(true);
    expect(store.getState().rooms['206']?.target?.aromaOn).toBe(true);
    runTool(call('classify_patient', { room: '206', form: allergic }), store);
    expect(store.getState().rooms['206']?.target?.aromaOn).toBe(false);
  });

  it('ni la rampa ni el regreso al estado previo vuelven a encenderlo', () => {
    const store = testStore();
    runTool(call('set_aroma', { room: '208', on: true, pct: 30 }), store);
    runTool(
      call(
        'apply_protocol',
        { room: '208', protocol: 'cura', durationMin: 5, restoreOnEnd: true },
        PRIORITY.MANUAL,
        {
          source: 'agent',
        },
      ),
      store,
    );
    runTool(call('classify_patient', { room: '208', form: allergic }), store);
    let now = store.getState().clock.nowMin;
    for (let i = 0; i < 20; i += 1) {
      now += 1;
      const n = now;
      store.setState((s) => tickRooms({ ...s, clock: { ...s.clock, nowMin: n } }, n, 15, 1));
      const room = store.getState().rooms['208'];
      expect(room?.values.aromaOn).toBe(false);
      expect(room?.target?.aromaOn ?? false).toBe(false);
    }
  });

  it('el perfil de ejemplo C (alergia a cítricos) bloquea el aroma de la activación matinal', () => {
    expect(SAMPLE_FORMS.C.aromaAllergy).toBe(true);
    expect(resolveProtocol('manana', 'C', SAMPLE_FORMS.C).aromaOn).toBe(false);
    expect(resolveProtocol('manana', 'C', { ...SAMPLE_FORMS.C, aromaAllergy: false }).aromaOn).toBe(
      true,
    );
  });
});
