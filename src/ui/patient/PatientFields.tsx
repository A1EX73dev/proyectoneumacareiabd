import type { ReactNode } from 'react';
import { SAMPLE_FORMS } from '../../core/classify';
import { bedLimits, describeBedLimits } from '../../core/policy/bed';
import {
  ADMISSION_REASONS,
  BED_RESTRICTIONS,
  CATEGORY_IDS,
  MOBILITY_LEVELS,
  RISK_LEVELS,
  type PatientForm,
} from '../../core/types';
import { Icon } from '../common/Icon';
import { useT } from '../hooks';

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {children}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="eyebrow">{title}</legend>
      {children}
    </fieldset>
  );
}

interface ScaleProps {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}

function Scale({ id, label, value, onChange }: ScaleProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="field-label">
          {label}
        </label>
        <output htmlFor={id} className="text-sm tabular-nums text-slate-700">
          {value}/10
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={10}
        step={1}
        value={value}
        aria-valuetext={`${value} / 10`}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-teal-600"
      />
    </div>
  );
}

/** Botones para rellenar el formulario con uno de los tres perfiles de ejemplo. */
export function PatientSamples({ onPick }: { onPick: (form: PatientForm) => void }) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-slate-600">{t('patient.loadSample')}</span>
      {CATEGORY_IDS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onPick(SAMPLE_FORMS[c])}
          className="btn btn-secondary btn-sm"
        >
          {t('patient.sample', { c })}
        </button>
      ))}
    </div>
  );
}

interface PatientFieldsProps {
  form: PatientForm;
  onChange: (form: PatientForm) => void;
  /** Prefijo de los id: el formulario aparece en cada habitación y en la ventana de ingreso. */
  idPrefix: string;
}

/** Campos del paciente. Los comparten el ingreso y la ficha de cada habitación. */
export function PatientFields({ form, onChange, idPrefix }: PatientFieldsProps) {
  const { t, tk } = useT();
  const id = (name: string) => `${idPrefix}-${name}`;
  const limits = bedLimits(form);

  function set<K extends keyof PatientForm>(key: K, value: PatientForm[K]) {
    onChange({ ...form, [key]: value });
  }

  return (
    <div className="space-y-6">
      <Group title={t('patient.groupIdentity')}>
        <Field id={id('name')} label={t('patient.name')}>
          <input
            id={id('name')}
            type="text"
            maxLength={60}
            autoComplete="off"
            value={form.name}
            placeholder={t('patient.namePlaceholder')}
            onChange={(e) => set('name', e.target.value)}
            className="field-input"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id={id('age')} label={t('patient.age')}>
            <input
              id={id('age')}
              type="number"
              min={0}
              max={120}
              value={form.age}
              onChange={(e) => set('age', Math.max(0, Math.min(120, Number(e.target.value) || 0)))}
              className="field-input"
            />
          </Field>
          <Field id={id('reason')} label={t('patient.reason')}>
            <select
              id={id('reason')}
              value={form.admissionReason}
              onChange={(e) =>
                set('admissionReason', e.target.value as PatientForm['admissionReason'])
              }
              className="field-input"
            >
              {ADMISSION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {tk('admission', r)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Group>

      <Group title={t('patient.groupMobility')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id={id('mobility')} label={t('patient.mobility')}>
            <select
              id={id('mobility')}
              value={form.mobility}
              onChange={(e) => set('mobility', e.target.value as PatientForm['mobility'])}
              className="field-input"
            >
              {MOBILITY_LEVELS.map((m) => (
                <option key={m} value={m}>
                  {tk('mobility', m)}
                </option>
              ))}
            </select>
          </Field>
          <Field id={id('bedRestriction')} label={t('patient.bedRestriction')}>
            <select
              id={id('bedRestriction')}
              value={form.bedRestriction}
              aria-describedby={id('bedHint')}
              onChange={(e) =>
                set('bedRestriction', e.target.value as PatientForm['bedRestriction'])
              }
              className="field-input"
            >
              {BED_RESTRICTIONS.map((r) => (
                <option key={r} value={r}>
                  {tk('bedRestriction', r)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p
          id={id('bedHint')}
          className={`flex items-start gap-2 ${limits.restricted ? 'note-warning' : 'note'}`}
        >
          <Icon name={limits.restricted ? 'lock' : 'bed'} className="mt-0.5 h-4 w-4" />
          <span>
            {limits.restricted
              ? t('patient.bedLimited', { limits: describeBedLimits(limits) })
              : t('patient.bedFree')}
          </span>
        </p>
      </Group>

      <Group title={t('patient.groupRisk')}>
        <Field id={id('delirium')} label={t('patient.delirium')}>
          <select
            id={id('delirium')}
            value={form.deliriumRisk}
            onChange={(e) => set('deliriumRisk', e.target.value as PatientForm['deliriumRisk'])}
            className="field-input"
          >
            {RISK_LEVELS.map((r) => (
              <option key={r} value={r}>
                {tk('risk', r)}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
          <Scale
            id={id('anxiety')}
            label={t('patient.anxiety')}
            value={form.anxiety}
            onChange={(v) => set('anxiety', v)}
          />
          <Scale
            id={id('sleep')}
            label={t('patient.sleep')}
            value={form.sleepQuality}
            onChange={(v) => set('sleepQuality', v)}
          />
          <Scale
            id={id('noise')}
            label={t('patient.noiseSens')}
            value={form.noiseSensitivity}
            onChange={(v) => set('noiseSensitivity', v)}
          />
          <Scale
            id={id('light')}
            label={t('patient.lightSens')}
            value={form.lightSensitivity}
            onChange={(v) => set('lightSensitivity', v)}
          />
        </div>
      </Group>

      <Group title={t('patient.groupAroma')}>
        <div className="space-y-3 rounded-xl p-3 ring-1 ring-inset ring-slate-200">
          <div className="flex items-center gap-2">
            <input
              id={id('allergy')}
              type="checkbox"
              checked={form.aromaAllergy}
              onChange={(e) => set('aromaAllergy', e.target.checked)}
              className="h-4 w-4 accent-teal-600"
            />
            <label htmlFor={id('allergy')} className="field-label">
              {t('patient.allergy')}
            </label>
          </div>
          {form.aromaAllergy && (
            <Field id={id('allergyText')} label={t('patient.allergyText')}>
              <input
                id={id('allergyText')}
                type="text"
                maxLength={200}
                value={form.aromaAllergyText}
                onChange={(e) => set('aromaAllergyText', e.target.value)}
                className="field-input"
              />
            </Field>
          )}
          <div className="flex items-center gap-2">
            <input
              id={id('wantsAroma')}
              type="checkbox"
              checked={form.wantsAroma}
              disabled={form.aromaAllergy}
              onChange={(e) => set('wantsAroma', e.target.checked)}
              className="h-4 w-4 accent-teal-600 disabled:opacity-50"
            />
            <label htmlFor={id('wantsAroma')} className="field-label">
              {t('patient.wantsAroma')}
            </label>
          </div>
        </div>
        <Field id={id('prefs')} label={t('patient.preferences')}>
          <textarea
            id={id('prefs')}
            rows={2}
            maxLength={500}
            value={form.preferences}
            onChange={(e) => set('preferences', e.target.value)}
            className="field-input"
          />
        </Field>
      </Group>
    </div>
  );
}
