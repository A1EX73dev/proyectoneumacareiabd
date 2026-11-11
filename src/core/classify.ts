import { t, tk } from '../i18n';
import { patientFlags, rangesByProtocol } from './policy/protocols';
import {
  CATEGORY_IDS,
  type CategoryId,
  type CategoryParams,
  type ClassificationResult,
  type Contribution,
  type PatientForm,
} from './types';

/**
 * Interfaz común: hoy la implementa un clasificador determinista por pesos; mañana
 * el LLM podrá invocar la misma operación como función (`classify_patient`).
 */
export interface Classifier {
  classify(form: PatientForm): ClassificationResult;
}

export interface Feature {
  id: string;
  category: CategoryId;
  weight: number;
  /** Valor normalizado 0–1 extraído del formulario. */
  value(form: PatientForm): number;
}

const scale10 = (v: number): number => Math.min(10, Math.max(0, v)) / 10;

/** Pesos visibles en la UI ("Por qué esta categoría"). */
export const FEATURES: Feature[] = [
  // A · Calma y confort
  { id: 'anxiety', category: 'A', weight: 4, value: (f) => scale10(f.anxiety) },
  { id: 'noiseSensitivity', category: 'A', weight: 1.5, value: (f) => scale10(f.noiseSensitivity) },
  { id: 'lightSensitivity', category: 'A', weight: 1.5, value: (f) => scale10(f.lightSensitivity) },
  {
    id: 'aromaWish',
    category: 'A',
    weight: 1,
    value: (f) => (f.wantsAroma && !f.aromaAllergy ? 1 : 0),
  },
  {
    id: 'reasonStress',
    category: 'A',
    weight: 1.5,
    value: (f) =>
      f.admissionReason === 'oncologia' || f.admissionReason === 'cardiologia' ? 1 : 0,
  },
  // B · Descanso y orientación
  { id: 'poorSleep', category: 'B', weight: 3, value: (f) => 1 - scale10(f.sleepQuality) },
  {
    id: 'delirium',
    category: 'B',
    weight: 4,
    value: (f) => (f.deliriumRisk === 'alto' ? 1 : f.deliriumRisk === 'medio' ? 0.5 : 0),
  },
  {
    id: 'age',
    category: 'B',
    weight: 2,
    value: (f) => (f.age >= 80 ? 1 : f.age >= 65 ? 0.5 : 0),
  },
  {
    id: 'reasonNeuro',
    category: 'B',
    weight: 1.5,
    value: (f) => (f.admissionReason === 'neurologia' ? 1 : 0),
  },
  // C · Activación y recuperación
  {
    id: 'reasonRecovery',
    category: 'C',
    weight: 2.5,
    value: (f) =>
      ['cirugia', 'traumatologia', 'respiratorio'].includes(f.admissionReason) ? 1 : 0,
  },
  {
    id: 'mobility',
    category: 'C',
    weight: 2,
    value: (f) => (f.mobility === 'autonomo' ? 1 : f.mobility === 'asistido' ? 0.8 : 0.2),
  },
  { id: 'lowAnxiety', category: 'C', weight: 1.5, value: (f) => 1 - scale10(f.anxiety) },
  { id: 'goodSleep', category: 'C', weight: 1, value: (f) => scale10(f.sleepQuality) },
  { id: 'youngAdult', category: 'C', weight: 1, value: (f) => (f.age < 65 ? 1 : 0) },
];

/** Orden de desempate: primero orientación (más conservadora), después calma, después activación. */
const TIE_ORDER: CategoryId[] = ['B', 'A', 'C'];

const round2 = (v: number): number => Math.round(v * 100) / 100;

function paramsFor(category: CategoryId, form: PatientForm): CategoryParams {
  const flags = patientFlags(form);
  const aromaByCategory = { A: 'lavanda', B: null, C: 'citrico' } as const;
  const aromaAllowed = flags.aromaBlocked || !flags.wantsAroma ? null : aromaByCategory[category];
  return {
    aromaBlocked: flags.aromaBlocked,
    aromaAllowed,
    preferredSoundscape:
      category === 'A' ? 'respiracion' : category === 'B' ? 'ruido_blanco' : 'pajaros',
    circadian: category === 'A' ? 'suave' : category === 'B' ? 'marcado' : 'activador',
    ranges: rangesByProtocol(category),
  };
}

export class WeightedClassifier implements Classifier {
  constructor(private readonly features: Feature[] = FEATURES) {}

  classify(form: PatientForm): ClassificationResult {
    const contributions: Contribution[] = this.features.map((f) => {
      const value = round2(f.value(form));
      return {
        category: f.category,
        feature: f.id,
        weight: f.weight,
        value,
        points: round2(value * f.weight),
      };
    });
    const scores = Object.fromEntries(
      CATEGORY_IDS.map((c) => [
        c,
        round2(contributions.filter((x) => x.category === c).reduce((s, x) => s + x.points, 0)),
      ]),
    ) as Record<CategoryId, number>;

    // Regla de seguridad explicable: riesgo alto de delirium ⇒ B (orientación).
    let rule: string | null = null;
    let category: CategoryId;
    if (form.deliriumRisk === 'alto') {
      rule = t('classify.ruleDelirium');
      category = 'B';
    } else {
      category = [...TIE_ORDER].sort((a, b) => scores[b] - scores[a])[0] ?? 'B';
    }

    const total = CATEGORY_IDS.reduce((s, c) => s + scores[c], 0);
    const confidence = total > 0 ? round2(scores[category] / total) : 0;

    const top = contributions
      .filter((c) => c.category === category && c.points > 0)
      .sort((a, b) => b.points - a.points)
      .slice(0, 3);
    const rationale: string[] = [];
    if (rule) rationale.push(rule);
    for (const c of top) {
      rationale.push(
        t('classify.contribution', { feature: tk('feature', c.feature), points: c.points }),
      );
    }
    if (form.aromaAllergy) rationale.push(t('classify.aromaBlocked'));

    return {
      category,
      confidence,
      rationale,
      params: paramsFor(category, form),
      scores,
      contributions,
      rule,
    };
  }
}

export const classifier: Classifier = new WeightedClassifier();

/**
 * Perfiles de ejemplo (simulados) usados en las pruebas y para sembrar la demo. Entre los tres
 * cubren la cama sin límites (A), la que no se puede estirar (B) y la que no se puede
 * incorporar del todo (C).
 */
export const SAMPLE_FORMS: Record<CategoryId, PatientForm> = {
  A: {
    name: 'M. Soler',
    age: 52,
    admissionReason: 'oncologia',
    anxiety: 9,
    sleepQuality: 6,
    noiseSensitivity: 8,
    lightSensitivity: 7,
    mobility: 'autonomo',
    deliriumRisk: 'bajo',
    bedRestriction: 'ninguna',
    aromaAllergy: false,
    aromaAllergyText: '',
    preferences: 'Luz tenue y sonidos de mar',
    wantsAroma: true,
  },
  B: {
    name: 'J. Ferrer',
    age: 84,
    admissionReason: 'neurologia',
    anxiety: 4,
    sleepQuality: 2,
    noiseSensitivity: 5,
    lightSensitivity: 4,
    mobility: 'encamado',
    deliriumRisk: 'alto',
    bedRestriction: 'respiratoria',
    aromaAllergy: false,
    aromaAllergyText: '',
    preferences: '',
    wantsAroma: false,
  },
  C: {
    name: 'A. Vidal',
    age: 45,
    admissionReason: 'traumatologia',
    anxiety: 2,
    sleepQuality: 8,
    noiseSensitivity: 3,
    lightSensitivity: 3,
    mobility: 'asistido',
    deliriumRisk: 'bajo',
    bedRestriction: 'cadera',
    aromaAllergy: true,
    aromaAllergyText: 'Cítricos',
    preferences: 'Quiere levantarse pronto',
    wantsAroma: true,
  },
};

export const EMPTY_FORM: PatientForm = {
  name: '',
  age: 65,
  admissionReason: 'medicina_interna',
  anxiety: 5,
  sleepQuality: 5,
  noiseSensitivity: 5,
  lightSensitivity: 5,
  mobility: 'asistido',
  deliriumRisk: 'bajo',
  bedRestriction: 'ninguna',
  aromaAllergy: false,
  aromaAllergyText: '',
  preferences: '',
  wantsAroma: false,
};
