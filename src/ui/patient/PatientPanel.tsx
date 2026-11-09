import { useState, type FormEvent, type ReactNode } from 'react';
import { EMPTY_FORM, FEATURES, SAMPLE_FORMS } from '../../core/classify';
import {
  ADMISSION_REASONS,
  CATEGORY_IDS,
  MOBILITY_LEVELS,
  RISK_LEVELS,
  type PatientForm,
} from '../../core/types';
import { manual } from '../actions';
import { CATEGORY_BADGE } from '../format';
import { useApp, useT } from '../hooks';

const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600';

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-800">
        {label}
      </label>
      {children}
    </div>
  );
}

function Scale({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between">
        <label htmlFor={id} className="text-sm font-medium text-slate-800">
          {label}
        </label>
        <output htmlFor={id} className="font-mono text-sm tabular-nums">
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

/** Formulario de clasificación. Los datos solo viven en memoria y se pueden borrar. */
export function PatientPanel({ roomId }: { roomId: string }) {
  const { t, tk } = useT();
  const room = useApp((s) => s.rooms[roomId]);
  const [form, setForm] = useState<PatientForm>(room?.patientForm ?? EMPTY_FORM);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  if (!room) return null;
  const result = room.classification;
  const id = (name: string) => `pf-${roomId}-${name}`;

  function set<K extends keyof PatientForm>(key: K, value: PatientForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const r = manual('classify_patient', { room: roomId, form }, t('reason.classifyUi'));
    setStatus(r.ok ? t('patient.classified') : r.error);
  }

  function onClear() {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    const r = manual('clear_patient', { room: roomId }, t('reason.clearUi'));
    setConfirmClear(false);
    setForm(EMPTY_FORM);
    setStatus(r.ok ? t('patient.cleared') : r.error);
  }

  return (
    <div className="space-y-5">
      <p className="rounded-md bg-teal-50 px-3 py-2 text-xs text-teal-900 ring-1 ring-teal-200">
        {t('patient.privacy')}
      </p>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-700">{t('patient.loadSample')}:</span>
        {CATEGORY_IDS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setForm(SAMPLE_FORMS[c])}
            className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
          >
            {t('patient.sample', { c })}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-3" aria-describedby={id('help')}>
        <p id={id('help')} className="sr-only">
          {t('patient.help')}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field id={id('age')} label={t('patient.age')}>
            <input
              id={id('age')}
              type="number"
              min={0}
              max={120}
              value={form.age}
              onChange={(e) => set('age', Math.max(0, Math.min(120, Number(e.target.value) || 0)))}
              className={inputClass}
            />
          </Field>
          <Field id={id('reason')} label={t('patient.reason')}>
            <select
              id={id('reason')}
              value={form.admissionReason}
              onChange={(e) =>
                set('admissionReason', e.target.value as PatientForm['admissionReason'])
              }
              className={inputClass}
            >
              {ADMISSION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {tk('admission', r)}
                </option>
              ))}
            </select>
          </Field>
          <Field id={id('mobility')} label={t('patient.mobility')}>
            <select
              id={id('mobility')}
              value={form.mobility}
              onChange={(e) => set('mobility', e.target.value as PatientForm['mobility'])}
              className={inputClass}
            >
              {MOBILITY_LEVELS.map((m) => (
                <option key={m} value={m}>
                  {tk('mobility', m)}
                </option>
              ))}
            </select>
          </Field>
          <Field id={id('delirium')} label={t('patient.delirium')}>
            <select
              id={id('delirium')}
              value={form.deliriumRisk}
              onChange={(e) => set('deliriumRisk', e.target.value as PatientForm['deliriumRisk'])}
              className={inputClass}
            >
              {RISK_LEVELS.map((r) => (
                <option key={r} value={r}>
                  {tk('risk', r)}
                </option>
              ))}
            </select>
          </Field>
        </div>

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

        <div className="space-y-2 rounded-lg p-3 ring-1 ring-slate-200">
          <div className="flex items-center gap-2">
            <input
              id={id('allergy')}
              type="checkbox"
              checked={form.aromaAllergy}
              onChange={(e) => set('aromaAllergy', e.target.checked)}
              className="h-4 w-4 accent-teal-600"
            />
            <label htmlFor={id('allergy')} className="text-sm font-medium text-slate-800">
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
                className={inputClass}
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
            <label htmlFor={id('wantsAroma')} className="text-sm font-medium text-slate-800">
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
            className={inputClass}
          />
        </Field>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            {t('patient.classify')}
          </button>
          <button
            type="button"
            onClick={onClear}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 ${
              confirmClear ? 'bg-red-700 text-white' : 'bg-red-50 text-red-800 ring-1 ring-red-300'
            }`}
          >
            {confirmClear ? t('patient.clearConfirm') : t('patient.clear')}
          </button>
          {confirmClear && (
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="rounded-md px-3 py-1.5 text-sm text-slate-700 ring-1 ring-slate-300"
            >
              {t('common.cancel')}
            </button>
          )}
        </div>
      </form>

      {status && (
        <p role="status" className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-800">
          {status}
        </p>
      )}

      {result ? (
        <div className="space-y-3 rounded-lg p-3 ring-1 ring-slate-200" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-sm font-bold ring-1 ${CATEGORY_BADGE[result.category]}`}
            >
              {tk('category', result.category)}
            </span>
            <span className="text-sm text-slate-700">
              {t('patient.confidence', { pct: Math.round(result.confidence * 100) })}
            </span>
          </div>
          <p className="text-sm text-slate-700">{tk('categoryDesc', result.category)}</p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-800">
            {result.rationale.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <div className="space-y-1">
            {CATEGORY_IDS.map((c) => {
              const max = Math.max(...CATEGORY_IDS.map((k) => result.scores[k]), 1);
              return (
                <div key={c} className="flex items-center gap-2 text-xs">
                  <span className="w-6 font-semibold">{c}</span>
                  <div className="h-2.5 flex-1 rounded bg-slate-100" aria-hidden="true">
                    <div
                      className={`h-2.5 rounded ${c === result.category ? 'bg-teal-600' : 'bg-slate-400'}`}
                      style={{ width: `${(result.scores[c] / max) * 100}%` }}
                    />
                  </div>
                  <span className="w-10 text-right font-mono tabular-nums">
                    {result.scores[c].toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold text-slate-900">
              {t('patient.why')}
            </summary>
            <p className="mt-2 text-xs text-slate-600">{t('patient.whyHelp')}</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[22rem] text-left text-xs">
                <thead>
                  <tr className="text-slate-600">
                    <th scope="col" className="py-1 pr-2">
                      {t('patient.feature')}
                    </th>
                    <th scope="col" className="py-1 pr-2">
                      {t('patient.category')}
                    </th>
                    <th scope="col" className="py-1 pr-2 text-right">
                      {t('patient.weight')}
                    </th>
                    <th scope="col" className="py-1 pr-2 text-right">
                      {t('patient.value')}
                    </th>
                    <th scope="col" className="py-1 text-right">
                      {t('patient.points')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.contributions.map((c) => (
                    <tr
                      key={c.feature}
                      className={`border-t border-slate-100 ${c.category === result.category ? 'font-semibold' : ''}`}
                    >
                      <td className="py-1 pr-2">{tk('feature', c.feature)}</td>
                      <td className="py-1 pr-2">{c.category}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{c.weight}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{c.value}</td>
                      <td className="py-1 text-right tabular-nums">{c.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      ) : (
        <div className="text-sm text-slate-600">
          <p>{t('patient.noResult')}</p>
          <p className="mt-2 text-xs">{t('patient.weightsSummary', { count: FEATURES.length })}</p>
        </div>
      )}
    </div>
  );
}
