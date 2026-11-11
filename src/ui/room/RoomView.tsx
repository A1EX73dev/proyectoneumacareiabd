import { lazy, Suspense } from 'react';
import { bedLimits } from '../../core/policy/bed';
import { isOverrideActive } from '../../core/policy/priorities';
import { hourOf } from '../../core/time';
import { backToMap } from '../actions';
import { CategoryBadge, ProtocolBadge } from '../common/Badges';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { Icon, type IconName } from '../common/Icon';
import { fmtDeg, fmtKelvin, fmtPct, fmtTemp } from '../format';
import { PRIORITY } from '../../core/types';
import { useApp, useT } from '../hooks';
import { openAdmitDialog } from '../overlay';

const Room3D = lazy(() => import('./Room3D'));

function Readout({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon name={icon} className="h-3.5 w-3.5 text-teal-300" />
      <dt className="text-slate-400">{label}</dt>
      <dd className="ml-auto pl-3 font-medium tabular-nums text-white">{value}</dd>
    </div>
  );
}

export function RoomView({ roomId }: { roomId: string }) {
  const { t, tk } = useT();
  const room = useApp((s) => s.rooms[roomId]);
  const nowMin = useApp((s) => s.clock.nowMin);
  if (!room) return null;
  const v = room.values;
  const form = room.patientForm;
  const name = form?.name.trim();
  const aroma = v.aromaOn ? `${tk('aroma', v.aromaType)} ${fmtPct(v.aromaPct)}` : t('common.off');
  const summary = t('room.sceneSummary', {
    room: room.id,
    protocol: tk('protocol', room.protocol),
    temp: fmtTemp(v.tempC),
    light: fmtPct(v.lightPct),
    kelvin: fmtKelvin(v.kelvin),
    sound: fmtPct(v.soundPct),
    soundscape: tk('soundscape', v.soundscape),
    aroma,
  });

  return (
    <section
      aria-labelledby="room-title"
      className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-8px_rgba(15,23,42,0.08)]"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-slate-100 px-5 py-3.5">
        <button type="button" onClick={backToMap} className="btn btn-secondary btn-sm">
          <Icon name="arrowLeft" className="h-3.5 w-3.5" />
          {t('room.back')}
        </button>
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-base font-semibold tabular-nums text-white">
            {room.id}
          </span>
          <div className="min-w-0">
            <h2 id="room-title" className="text-[15px] font-semibold leading-5 text-slate-900">
              {t('room.title', { room: room.id })}
            </h2>
            <p className="truncate text-sm text-slate-600">
              {room.occupied ? (
                <>
                  <span className={name ? 'text-slate-800' : 'text-slate-500'}>
                    {name || t('patient.anonymous')}
                  </span>
                  {form && ` · ${t('patient.years', { age: form.age })}`}
                </>
              ) : (
                t('patient.emptyTitle')
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {room.occupied && <ProtocolBadge protocol={room.protocol} />}
          {room.category && <CategoryBadge category={room.category} />}
          {bedLimits(form).restricted && (
            <span className="chip bg-amber-50 text-amber-900 ring-amber-200">
              <Icon name="lock" className="h-3.5 w-3.5" />
              {tk('bedRestriction', form?.bedRestriction ?? 'ninguna')}
            </span>
          )}
        </div>
        {!room.occupied && (
          <button
            type="button"
            onClick={() => openAdmitDialog(room.id)}
            className="btn btn-primary ml-auto"
          >
            <Icon name="userPlus" />
            {t('room.admit')}
          </button>
        )}
      </div>

      <div
        className="relative h-[56vh] min-h-[340px] bg-slate-900"
        role="region"
        aria-label={t('room.sceneLabel', { room: room.id })}
        aria-describedby="room-scene-summary"
      >
        <ErrorBoundary
          fallback={
            <p className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-200">
              {t('room.noWebgl')}
            </p>
          }
        >
          <Suspense
            fallback={
              <p className="flex h-full items-center justify-center text-sm text-slate-200">
                {t('room.loading3d')}
              </p>
            }
          >
            <Room3D
              values={v}
              hour={hourOf(nowMin)}
              occupied={room.occupied}
              bedDeg={room.bed.backrestDeg}
              alarm={
                isOverrideActive(room.override, nowMin) &&
                room.override.priority === PRIORITY.SAFETY
              }
            />
          </Suspense>
        </ErrorBoundary>
        <p id="room-scene-summary" className="sr-only">
          {summary}
        </p>
        <div className="pointer-events-none absolute left-3 top-3 w-64 max-w-[calc(100%-1.5rem)] rounded-xl bg-slate-950/75 p-3 text-xs shadow-lg ring-1 ring-white/10 backdrop-blur">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <span
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400"
              aria-hidden="true"
            />
            {t('room.monitor')}
          </p>
          <dl className="space-y-1.5">
            <Readout icon="thermometer" label={t('room.temp')} value={fmtTemp(v.tempC)} />
            <Readout
              icon="sun"
              label={t('room.light')}
              value={`${fmtPct(v.lightPct)} · ${fmtKelvin(v.kelvin)}`}
            />
            <Readout icon="blinds" label={t('room.blinds')} value={fmtPct(v.blindsPct)} />
            <Readout icon="bed" label={t('room.backrest')} value={fmtDeg(room.bed.backrestDeg)} />
            <Readout
              icon="volume"
              label={t('room.sound')}
              value={
                v.soundscape === 'silencio'
                  ? tk('soundscape', v.soundscape)
                  : `${fmtPct(v.soundPct)} · ${tk('soundscape', v.soundscape)}`
              }
            />
            <Readout icon="droplet" label={t('room.aroma')} value={aroma} />
          </dl>
        </div>
        <p className="pointer-events-none absolute bottom-3 right-3 rounded-md bg-slate-950/60 px-2 py-1 text-xs text-slate-300">
          {t('room.orbitHint')}
        </p>
      </div>
    </section>
  );
}
