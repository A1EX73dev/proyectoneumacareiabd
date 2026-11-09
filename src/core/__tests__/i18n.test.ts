import { describe, expect, it } from 'vitest';
import { DICTIONARIES, LANGS, translate } from '../../i18n';
import { FEATURES } from '../classify';
import { TOOL_NAMES } from '../tools';
import {
  ADMISSION_REASONS,
  AROMA_TYPES,
  CATEGORY_IDS,
  PRIORITY_LEVELS,
  PROTOCOL_IDS,
  SOUNDSCAPES,
  TRIGGER_TYPES,
} from '../types';

describe('i18n', () => {
  it('ca y en tienen exactamente las mismas claves que es', () => {
    const base = Object.keys(DICTIONARIES.es).sort();
    for (const lang of LANGS) expect(Object.keys(DICTIONARIES[lang]).sort()).toEqual(base);
  });

  it('existen todas las claves compuestas que se generan dinámicamente', () => {
    const dynamic = [
      ...PROTOCOL_IDS.map((p) => `protocol.${p}`),
      ...TRIGGER_TYPES.map((x) => `trigger.${x}`),
      ...SOUNDSCAPES.map((x) => `soundscape.${x}`),
      ...AROMA_TYPES.map((x) => `aroma.${x}`),
      ...CATEGORY_IDS.flatMap((c) => [`category.${c}`, `categoryDesc.${c}`]),
      ...PRIORITY_LEVELS.map((p) => `priority.${p}`),
      ...ADMISSION_REASONS.map((x) => `admission.${x}`),
      ...FEATURES.map((f) => `feature.${f.id}`),
      ...TOOL_NAMES.map((n) => `tool.${n}`),
    ];
    const es = DICTIONARIES.es as Record<string, string>;
    for (const key of dynamic) expect(es[key], key).toBeTypeOf('string');
  });

  it('interpola parámetros', () => {
    expect(translate('en', 'room.title', { room: '205' })).toBe('Room 205');
    expect(translate('ca', 'room.title', { room: '205' })).toBe('Habitació 205');
  });
});
