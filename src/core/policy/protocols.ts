import {
  AROMA_TYPES,
  NUMERIC_ENV_KEYS,
  PRIORITY,
  PROTOCOL_IDS,
  SOUNDSCAPES,
  type AromaType,
  type CategoryId,
  type EnvValues,
  type NumericEnvKey,
  type PatientForm,
  type PriorityLevel,
  type ProtocolId,
  type Range,
  type Ranges,
  type Soundscape,
} from '../types';
import type { DayPhase } from '../time';

/** Rangos físicos de los dispositivos (sliders de la UI). */
export const DEVICE_RANGES: Ranges = {
  tempC: [18, 28],
  lightPct: [0, 100],
  kelvin: [2200, 6500],
  blindsPct: [0, 100],
  soundPct: [0, 100],
  aromaPct: [0, 100],
};

/** Valores base de cada protocolo, antes de personalizar por categoría. */
export const PROTOCOL_PRESETS: Record<ProtocolId, EnvValues> = {
  noche: {
    tempC: 21,
    lightPct: 2,
    kelvin: 2200,
    blindsPct: 0,
    soundPct: 5,
    soundscape: 'silencio',
    aromaOn: false,
    aromaPct: 0,
    aromaType: 'lavanda',
  },
  calma: {
    tempC: 22.5,
    lightPct: 35,
    kelvin: 2700,
    blindsPct: 45,
    soundPct: 20,
    soundscape: 'olas',
    aromaOn: true,
    aromaPct: 20,
    aromaType: 'lavanda',
  },
  manana: {
    tempC: 22,
    lightPct: 80,
    kelvin: 5000,
    blindsPct: 100,
    soundPct: 25,
    soundscape: 'pajaros',
    aromaOn: false,
    aromaPct: 0,
    aromaType: 'citrico',
  },
  comida: {
    tempC: 22,
    lightPct: 70,
    kelvin: 3500,
    blindsPct: 80,
    soundPct: 12,
    soundscape: 'bosque',
    aromaOn: false,
    aromaPct: 0,
    aromaType: 'lavanda',
  },
  medicacion: {
    tempC: 22,
    lightPct: 40,
    kelvin: 3000,
    blindsPct: 70,
    soundPct: 0,
    soundscape: 'silencio',
    aromaOn: false,
    aromaPct: 0,
    aromaType: 'lavanda',
  },
  cura: {
    tempC: 22,
    lightPct: 100,
    kelvin: 4000,
    blindsPct: 30,
    soundPct: 0,
    soundscape: 'silencio',
    aromaOn: false,
    aromaPct: 0,
    aromaType: 'lavanda',
  },
  visita: {
    tempC: 22.5,
    lightPct: 65,
    kelvin: 3000,
    blindsPct: 80,
    soundPct: 15,
    soundscape: 'bosque',
    aromaOn: false,
    aromaPct: 0,
    aromaType: 'lavanda',
  },
  neutro: {
    tempC: 22,
    lightPct: 50,
    kelvin: 4000,
    blindsPct: 70,
    soundPct: 10,
    soundscape: 'silencio',
    aromaOn: false,
    aromaPct: 0,
    aromaType: 'lavanda',
  },
};

export interface ProtocolRule {
  ranges?: Partial<Ranges>;
  prefer?: Partial<EnvValues>;
  soundscapes?: Soundscape[];
  aromaTypes?: AromaType[];
}

export interface CategoryProfile {
  id: CategoryId;
  base: Required<Pick<ProtocolRule, 'ranges' | 'soundscapes' | 'aromaTypes'>>;
  byProtocol: Partial<Record<ProtocolId, ProtocolRule>>;
}

/**
 * Rangos por categoría y protocolo. El agente (prioridad ≥ procedimiento) siempre
 * recorta sus valores a estos rangos. Las órdenes manuales y la seguridad no.
 */
export const CATEGORY_PROFILES: Record<CategoryId, CategoryProfile> = {
  A: {
    id: 'A',
    base: {
      ranges: {
        tempC: [21.5, 24],
        lightPct: [0, 60],
        kelvin: [2400, 2700],
        // Luz natural tamizada: la persiana nunca se sube del todo.
        blindsPct: [0, 70],
        soundPct: [0, 35],
        aromaPct: [0, 40],
      },
      soundscapes: ['olas', 'lluvia', 'bosque', 'respiracion', 'silencio'],
      aromaTypes: ['lavanda'],
    },
    byProtocol: {
      noche: {
        ranges: { lightPct: [0, 5], blindsPct: [0, 10], soundPct: [0, 15] },
        prefer: { soundscape: 'lluvia', soundPct: 8 },
      },
      calma: {
        ranges: { lightPct: [15, 40] },
        prefer: {
          lightPct: 30,
          kelvin: 2500,
          blindsPct: 40,
          soundscape: 'respiracion',
          soundPct: 25,
          aromaOn: true,
          aromaType: 'lavanda',
          aromaPct: 25,
        },
      },
      manana: {
        ranges: { lightPct: [30, 65], kelvin: [2700, 3500] },
        prefer: { lightPct: 55, kelvin: 3000, blindsPct: 60, soundscape: 'bosque', soundPct: 20 },
      },
      comida: {
        ranges: { lightPct: [40, 60], kelvin: [2700, 3000] },
        prefer: { lightPct: 55, kelvin: 2900, blindsPct: 60, soundscape: 'bosque', soundPct: 12 },
      },
      visita: {
        ranges: { lightPct: [35, 60] },
        prefer: { lightPct: 50, kelvin: 2700, blindsPct: 60 },
      },
      medicacion: { ranges: { lightPct: [25, 40] }, prefer: { blindsPct: 50 } },
      neutro: {
        prefer: { lightPct: 40, kelvin: 2700, blindsPct: 50, soundscape: 'olas', soundPct: 15 },
      },
    },
  },
  B: {
    id: 'B',
    base: {
      ranges: {
        tempC: [20.5, 23],
        lightPct: [0, 100],
        kelvin: [2200, 6500],
        soundPct: [0, 25],
        aromaPct: [0, 0],
      },
      soundscapes: ['ruido_blanco', 'lluvia', 'silencio'],
      aromaTypes: [],
    },
    byProtocol: {
      // Ciclo circadiano muy marcado: persiana bajada del todo de noche y subida de día.
      noche: {
        ranges: { lightPct: [0, 1], kelvin: [2200, 2300], blindsPct: [0, 0], soundPct: [0, 10] },
        prefer: { lightPct: 0, kelvin: 2200, soundscape: 'ruido_blanco', soundPct: 6, tempC: 21 },
      },
      manana: {
        ranges: { lightPct: [75, 100], kelvin: [5000, 6500], blindsPct: [80, 100] },
        prefer: { lightPct: 90, kelvin: 6000, blindsPct: 100, soundscape: 'lluvia', soundPct: 15 },
      },
      neutro: {
        ranges: { lightPct: [60, 100], kelvin: [4500, 6500], blindsPct: [70, 100] },
        prefer: {
          lightPct: 75,
          kelvin: 5000,
          blindsPct: 100,
          soundscape: 'silencio',
          soundPct: 0,
        },
      },
      calma: {
        ranges: { lightPct: [20, 50], kelvin: [2700, 3500] },
        prefer: { lightPct: 35, kelvin: 3000, soundscape: 'lluvia', soundPct: 15 },
      },
      comida: { ranges: { lightPct: [60, 80], kelvin: [3000, 4000] } },
      visita: { ranges: { lightPct: [50, 75], kelvin: [3000, 3500] } },
      medicacion: { ranges: { lightPct: [30, 50] } },
    },
  },
  C: {
    id: 'C',
    base: {
      ranges: {
        tempC: [20.5, 23.5],
        lightPct: [10, 100],
        kelvin: [2700, 6500],
        soundPct: [0, 40],
        aromaPct: [0, 30],
      },
      soundscapes: ['pajaros', 'bosque', 'olas', 'lluvia', 'silencio'],
      aromaTypes: ['citrico'],
    },
    byProtocol: {
      noche: {
        ranges: { lightPct: [0, 5], kelvin: [2200, 2700], blindsPct: [0, 10], soundPct: [0, 15] },
        prefer: { soundscape: 'olas', soundPct: 6 },
      },
      manana: {
        ranges: { lightPct: [80, 100], kelvin: [5000, 6500], blindsPct: [80, 100] },
        prefer: {
          lightPct: 95,
          kelvin: 5800,
          blindsPct: 100,
          soundscape: 'pajaros',
          soundPct: 30,
          aromaOn: true,
          aromaType: 'citrico',
          aromaPct: 15,
        },
      },
      neutro: {
        ranges: { lightPct: [60, 100], kelvin: [4500, 6500] },
        prefer: { lightPct: 80, kelvin: 5000, blindsPct: 90, soundscape: 'bosque', soundPct: 15 },
      },
      calma: { ranges: { lightPct: [30, 60], kelvin: [3000, 4000] } },
      comida: { ranges: { lightPct: [60, 85], kelvin: [3000, 4000] } },
      visita: { ranges: { lightPct: [50, 80], kelvin: [3000, 3500] } },
      medicacion: { ranges: { lightPct: [35, 55] } },
    },
  },
};

/** Requisitos clínicos que prevalecen sobre cualquier categoría. */
export const CLINICAL_LOCKS: Partial<Record<ProtocolId, ProtocolRule>> = {
  cura: {
    ranges: { lightPct: [100, 100], kelvin: [4000, 4000], soundPct: [0, 0], aromaPct: [0, 0] },
    prefer: { soundscape: 'silencio', aromaOn: false },
    soundscapes: ['silencio'],
    aromaTypes: [],
  },
  medicacion: {
    ranges: { soundPct: [0, 0], aromaPct: [0, 0] },
    prefer: { soundscape: 'silencio', aromaOn: false },
    soundscapes: ['silencio'],
    aromaTypes: [],
  },
  comida: {
    ranges: { aromaPct: [0, 10] },
    prefer: { aromaOn: false },
  },
};

export interface ResolvedRules {
  ranges: Ranges;
  soundscapes: Soundscape[];
  aromaTypes: AromaType[];
}

function withinDevice(key: NumericEnvKey, range: Range): Range {
  const [dMin, dMax] = DEVICE_RANGES[key];
  const lo = Math.min(dMax, Math.max(dMin, range[0]));
  const hi = Math.min(dMax, Math.max(lo, range[1]));
  return [lo, hi];
}

/** Rangos efectivos: dispositivo ← categoría ← categoría×protocolo ← requisitos clínicos. */
export function rulesFor(category: CategoryId | null, protocol: ProtocolId): ResolvedRules {
  const profile = category ? CATEGORY_PROFILES[category] : null;
  const byProtocol = profile?.byProtocol[protocol];
  const lock = CLINICAL_LOCKS[protocol];
  const merged: Ranges = {
    ...DEVICE_RANGES,
    ...(profile?.base.ranges ?? {}),
    ...(byProtocol?.ranges ?? {}),
    ...(lock?.ranges ?? {}),
  };
  const ranges = Object.fromEntries(
    NUMERIC_ENV_KEYS.map((key) => [key, withinDevice(key, merged[key])]),
  ) as Ranges;
  const soundscapes = lock?.soundscapes ??
    byProtocol?.soundscapes ??
    profile?.base.soundscapes ?? [...SOUNDSCAPES];
  const aromaTypes = lock?.aromaTypes ??
    byProtocol?.aromaTypes ??
    profile?.base.aromaTypes ?? [...AROMA_TYPES];
  return { ranges, soundscapes, aromaTypes };
}

function roundKey(key: NumericEnvKey, value: number): number {
  if (key === 'tempC') return Math.round(value * 10) / 10;
  if (key === 'kelvin') return Math.round(value / 10) * 10;
  return Math.round(value);
}

/** Recorta y redondea los valores numéricos a unos rangos. */
export function clampValues(values: EnvValues, ranges: Ranges): EnvValues {
  const next = { ...values };
  for (const key of NUMERIC_ENV_KEYS) {
    const [lo, hi] = ranges[key];
    next[key] = roundKey(key, Math.min(hi, Math.max(lo, values[key])));
  }
  return next;
}

export interface PatientFlags {
  aromaBlocked: boolean;
  wantsAroma: boolean;
}

export function patientFlags(form: PatientForm | null): PatientFlags {
  const aromaBlocked = form?.aromaAllergy === true;
  return { aromaBlocked, wantsAroma: !aromaBlocked && form?.wantsAroma === true };
}

/** Valores de un protocolo personalizados para la categoría del paciente y recortados a sus rangos. */
export function resolveProtocol(
  protocol: ProtocolId,
  category: CategoryId | null,
  form: PatientForm | null,
): EnvValues {
  const rules = rulesFor(category, protocol);
  const profile = category ? CATEGORY_PROFILES[category] : null;
  const flags = patientFlags(form);
  const v: EnvValues = {
    ...PROTOCOL_PRESETS[protocol],
    ...(profile?.byProtocol[protocol]?.prefer ?? {}),
    ...(CLINICAL_LOCKS[protocol]?.prefer ?? {}),
  };
  if (!rules.soundscapes.includes(v.soundscape)) v.soundscape = rules.soundscapes[0] ?? 'silencio';
  const aromaAllowed =
    !flags.aromaBlocked &&
    flags.wantsAroma &&
    rules.aromaTypes.length > 0 &&
    rules.ranges.aromaPct[1] > 0;
  if (!aromaAllowed) {
    v.aromaOn = false;
    v.aromaPct = 0;
  } else if (!rules.aromaTypes.includes(v.aromaType)) {
    v.aromaType = rules.aromaTypes[0] ?? v.aromaType;
  }
  return clampValues(v, rules.ranges);
}

export interface EnforceContext {
  category: CategoryId | null;
  protocol: ProtocolId;
  form: PatientForm | null;
  priority: PriorityLevel;
}

export interface EnforceOutcome {
  values: EnvValues;
  adjusted: string[];
}

/**
 * Aplica las reglas antes de mover un actuador:
 *  - siempre: rangos físicos del dispositivo y bloqueo de aroma por alergia;
 *  - si actúa el agente (prioridad ≥ procedimiento): rangos de la categoría para el protocolo.
 */
export function enforceRules(values: EnvValues, ctx: EnforceContext): EnforceOutcome {
  let v = clampValues(values, DEVICE_RANGES);
  if (ctx.priority >= PRIORITY.PROCEDURE) {
    const rules = rulesFor(ctx.category, ctx.protocol);
    v = clampValues(v, rules.ranges);
    if (!rules.soundscapes.includes(v.soundscape))
      v.soundscape = rules.soundscapes[0] ?? 'silencio';
    const flags = patientFlags(ctx.form);
    if (v.aromaOn && (!flags.wantsAroma || !rules.aromaTypes.includes(v.aromaType))) {
      v.aromaOn = false;
    }
  }
  if (patientFlags(ctx.form).aromaBlocked) {
    v.aromaOn = false;
    v.aromaPct = 0;
  }
  // El redondeo no cuenta como ajuste; solo los recortes reales.
  const adjusted = (Object.keys(values) as (keyof EnvValues)[]).filter((key) => {
    const before = values[key];
    const after = v[key];
    if (typeof before === 'number' && typeof after === 'number') {
      const tolerance = key === 'kelvin' ? 5 : key === 'tempC' ? 0.05 : 0.5;
      return Math.abs(before - after) > tolerance;
    }
    return before !== after;
  });
  return { values: v, adjusted };
}

/** Protocolo circadiano que corresponde a cada fase del día y categoría. */
export function phaseProtocol(phase: DayPhase, category: CategoryId | null): ProtocolId {
  if (phase === 'night') return 'noche';
  if (phase === 'morning') return 'manana';
  return category === 'A' ? 'calma' : 'neutro';
}

/** Todos los rangos por protocolo de una categoría (para mostrar y para `classify_patient`). */
export function rangesByProtocol(category: CategoryId | null): Record<ProtocolId, Ranges> {
  return Object.fromEntries(PROTOCOL_IDS.map((p) => [p, rulesFor(category, p).ranges])) as Record<
    ProtocolId,
    Ranges
  >;
}
