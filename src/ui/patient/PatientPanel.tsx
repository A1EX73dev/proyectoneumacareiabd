import { useState, type FormEvent } from 'react';
import { EMPTY_FORM, FEATURES } from '../../core/classify';
import { bedLimits, describeBedLimits } from '../../core/policy/bed';
import { CATEGORY_IDS, type ClassificationResult, type PatientForm } from '../../core/types';
import { manual } from '../actions';
import { CategoryBadge } from '../common/Badges';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Icon } from '../common/Icon';
import { useApp, useT } from '../hooks';
import { openAdmitDialog, pushToast } from '../overlay';
import { PatientFields, PatientSamples } from './PatientFields';

function EmptyRoom({ roomId }: { roomId: string }) {
  const { t } = useT();
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-500 ring-1 ring-slate-200">
        <Icon name="bed" className="h-6 w-6" />
      </span>
      <h3 className="mt-3 text-base font-semibold text-slate-900">{t('patient.emptyTitle')}</h3>
      <p className="mt-1 max-w-xs text-sm text-slate-600">{t('patient.emptyBody')}</p>
      <button
        type="button"
        onClick={() => openAdmitDialog(roomId)}
        className="btn btn-primary mt-5"
      >
        <Icon name="userPlus" />
        {t('admit.open')}
      </button>
    </div>
  );
}

function PatientSummary({
  form,
  result,
}: {
  form: PatientForm;
  result: ClassificationResult | null;
}) {
  const { t, tk } = useT();
  const limits = bedLimits(form);
  const name = form.name.trim();
  return (
    <div className="rounded-xl bg-gradient-to-br from-teal-50 to-white p-4 ring-1 ring-inset ring-teal-100">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-700 text-white">
          <Icon name="user" className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-base font-semibold ${name ? 'text-slate-900' : 'text-slate-500'}`}
          >
            {name || t('patient.anonymous')}
          </p>
          <p className="text-sm text-slate-600">
            {t('patient.years', { age: form.age })} · {tk('admission', form.admissionReason)} ·{' '}
            {tk('mobility', form.mobility)}
          </p>
          {result && (
            <div className="mt-2">
              <CategoryBadge category={result.category} />
            </div>
          )}
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        <li className="chip">
          <Icon name={limits.restricted ? 'lock' : 'bed'} className="h-3.5 w-3.5 text-slate-500" />
          {limits.restricted
            ? `${tk('bedRestriction', form.bedRestriction)} · ${describeBedLimits(limits)}`
            : tk('bedRestriction', 'ninguna')}
        </li>
        {form.aromaAllergy && (
          <li className="chip bg-red-50 text-red-900 ring-red-200">
            <Icon name="alert" className="h-3.5 w-3.5" />
            {t('patient.allergy')}
            {form.aromaAllergyText.trim() && `: ${form.aromaAllergyText.trim()}`}
          </li>
        )}
        {form.deliriumRisk !== 'bajo' && (
          <li className="chip">
            {t('patient.delirium')}: {tk('risk', form.deliriumRisk)}
          </li>
        )}
      </ul>
    </div>
  );
}

function ClassificationView({ result }: { result: ClassificationResult }) {
  const { t, tk } = useT();
  const max = Math.max(...CATEGORY_IDS.map((k) => result.scores[k]), 1);
  return (
    <section aria-labelledby="pf-result" className="space-y-3" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="pf-result" className="eyebrow">
          {t('patient.result')}
        </h3>
        <span className="text-xs text-slate-600">
          {t('patient.confidence', { pct: Math.round(result.confidence * 100) })}
        </span>
      </div>
      <p className="text-sm text-slate-700">{tk('categoryDesc', result.category)}</p>
      <div className="space-y-1.5">
        {CATEGORY_IDS.map((c) => (
          <div key={c} className="flex items-center gap-2 text-xs">
            <span className="w-4 font-semibold text-slate-700">{c}</span>
            <div
              className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"
              aria-hidden="true"
            >
              <div
                className={`h-2 rounded-full ${c === result.category ? 'bg-teal-600' : 'bg-slate-300'}`}
                style={{ width: `${(result.scores[c] / max) * 100}%` }}
              />
            </div>
            <span className="w-10 text-right tabular-nums text-slate-700">
              {result.scores[c].toFixed(2)}
            </span>
          </div>
        ))}
      </div>
      <ul className="space-y-1 text-sm text-slate-800">
        {result.rationale.map((r) => (
          <li key={r} className="flex gap-2">
            <Icon name="check" className="mt-0.5 h-4 w-4 text-teal-700" />
            <span>{r}</span>
          </li>
        ))}
      </ul>
      <details className="group rounded-lg ring-1 ring-inset ring-slate-200">
        <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
          <span
            className="inline-block w-4 transition-transform group-open:rotate-90"
            aria-hidden="true"
          >
            ›
          </span>
          {t('patient.why')}
        </summary>
        <div className="border-t border-slate-200 px-3 py-2">
          <p className="text-xs text-slate-600">{t('patient.whyHelp')}</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[22rem] text-left text-xs">
              <thead>
                <tr className="text-slate-600">
                  <th scope="col" className="py-1 pr-2 font-medium">
                    {t('patient.feature')}
                  </th>
                  <th scope="col" className="py-1 pr-2 font-medium">
                    {t('patient.category')}
                  </th>
                  <th scope="col" className="py-1 pr-2 text-right font-medium">
                    {t('patient.weight')}
                  </th>
                  <th scope="col" className="py-1 pr-2 text-right font-medium">
                    {t('patient.value')}
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    {t('patient.points')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.contributions.map((c) => (
                  <tr
                    key={c.feature}
                    className={`border-t border-slate-100 ${c.category === result.category ? 'font-semibold text-slate-900' : 'text-slate-700'}`}
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
        </div>
      </details>
    </section>
  );
}

/** Ficha del paciente de una habitación: resumen, clasificación, edición y borrado. */
export function PatientPanel({ roomId }: { roomId: string }) {
  const { t } = useT();
  const room = useApp((s) => s.rooms[roomId]);
  const [form, setForm] = useState<PatientForm>(room?.patientForm ?? EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  // Si los datos cambian por otra vía (ingreso, sustitución, voz…), el formulario los recoge.
  const [syncedForm, setSyncedForm] = useState(room?.patientForm ?? null);
  if (room && room.patientForm !== syncedForm) {
    setSyncedForm(room.patientForm);
    setForm(room.patientForm ?? EMPTY_FORM);
  }
  if (!room) return null;
  if (!room.occupied) return <EmptyRoom roomId={roomId} />;

  const result = room.classification;
  // Tras borrar los datos la habitación sigue ocupada: el formulario se abre para rellenarlo.
  const hasData = room.patientForm !== null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const r = manual('classify_patient', { room: roomId, form }, t('reason.classifyUi'));
    if (r.ok) {
      setError(null);
      pushToast({ tone: 'success', title: t('patient.classified') });
    } else {
      setError(r.error);
    }
  }

  function onClear() {
    setConfirmClear(false);
    const r = manual('clear_patient', { room: roomId }, t('reason.clearUi'));
    setForm(EMPTY_FORM);
    if (r.ok) pushToast({ tone: 'success', title: t('patient.cleared') });
    else setError(r.error);
  }

  const editor = (
    <form onSubmit={onSubmit} className="space-y-5" aria-describedby={`pf-${roomId}-help`}>
      <p id={`pf-${roomId}-help`} className="sr-only">
        {t('patient.help')}
      </p>
      <PatientSamples onPick={(sample) => setForm({ ...sample, name: form.name })} />
      <PatientFields form={form} onChange={setForm} idPrefix={`pf-${roomId}`} />
      {error && (
        <p role="alert" className="note-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
        <button type="submit" className="btn btn-primary">
          <Icon name="check" />
          {hasData ? t('patient.save') : t('patient.classify')}
        </button>
        {hasData && (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="btn btn-danger-soft"
          >
            <Icon name="trash" />
            {t('patient.clear')}
          </button>
        )}
      </div>
    </form>
  );

  return (
    <div className="space-y-5">
      {room.patientForm && <PatientSummary form={room.patientForm} result={result} />}
      {result ? (
        <ClassificationView result={result} />
      ) : (
        <div className="note">
          <p>{t('patient.noResult')}</p>
          <p className="mt-1 text-xs text-slate-600">
            {t('patient.weightsSummary', { count: FEATURES.length })}
          </p>
        </div>
      )}

      {hasData ? (
        <details className="group rounded-xl ring-1 ring-inset ring-slate-200">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
            <Icon name="sliders" className="h-4 w-4 text-slate-500" />
            {t('patient.editTitle')}
            <span
              aria-hidden="true"
              className="ml-auto text-slate-400 transition-transform group-open:rotate-90"
            >
              ›
            </span>
          </summary>
          <div className="border-t border-slate-200 p-4">{editor}</div>
        </details>
      ) : (
        <section aria-labelledby={`pf-${roomId}-edit`} className="space-y-3">
          <h3 id={`pf-${roomId}-edit`} className="eyebrow">
            {t('patient.editTitle')}
          </h3>
          <p className="note-info text-xs">{t('patient.privacy')}</p>
          {editor}
        </section>
      )}

      <ConfirmDialog
        open={confirmClear}
        titleId={`pf-${roomId}-clear-title`}
        title={t('patient.clearTitle', { room: roomId })}
        confirmLabel={t('patient.clearConfirm')}
        cancelLabel={t('common.cancel')}
        closeLabel={t('common.close')}
        tone="danger"
        onCancel={() => setConfirmClear(false)}
        onConfirm={onClear}
      >
        <p>{t('patient.clearBody')}</p>
      </ConfirmDialog>
    </div>
  );
}
