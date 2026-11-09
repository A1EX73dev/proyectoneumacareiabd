import { lazy, Suspense } from 'react';
import { hourOf } from '../../core/time';
import { backToMap } from '../actions';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { CATEGORY_BADGE, fmtKelvin, fmtPct, fmtTemp, PROTOCOL_COLORS } from '../format';
import { useApp, useT } from '../hooks';

const Room3D = lazy(() => import('./Room3D'));

export function RoomView({ roomId }: { roomId: string }) {
  const { t, tk } = useT();
  const room = useApp((s) => s.rooms[roomId]);
  const nowMin = useApp((s) => s.clock.nowMin);
  if (!room) return null;
  const v = room.values;
  const summary = t('room.sceneSummary', {
    room: room.id,
    protocol: tk('protocol', room.protocol),
    temp: fmtTemp(v.tempC),
    light: fmtPct(v.lightPct),
    kelvin: fmtKelvin(v.kelvin),
    sound: fmtPct(v.soundPct),
    soundscape: tk('soundscape', v.soundscape),
    aroma: v.aromaOn ? `${tk('aroma', v.aromaType)} ${fmtPct(v.aromaPct)}` : t('common.off'),
  });

  return (
    <section
      aria-labelledby="room-title"
      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-2.5">
        <button
          type="button"
          onClick={backToMap}
          className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
        >
          ← {t('room.back')}
        </button>
        <h2 id="room-title" className="text-base font-semibold text-slate-900">
          {t('room.title', { room: room.id })}
        </h2>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-semibold text-slate-900 ring-1 ring-slate-300"
          style={{ backgroundColor: PROTOCOL_COLORS[room.protocol] }}
        >
          {tk('protocol', room.protocol)}
        </span>
        {room.category && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${CATEGORY_BADGE[room.category]}`}
          >
            {tk('category', room.category)}
          </span>
        )}
        {!room.occupied && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
            {t('map.free')}
          </span>
        )}
      </div>

      <div
        className="relative h-[52vh] min-h-[320px] bg-slate-900"
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
            <Room3D values={v} hour={hourOf(nowMin)} occupied={room.occupied} />
          </Suspense>
        </ErrorBoundary>
        <p id="room-scene-summary" className="sr-only">
          {summary}
        </p>
        <dl className="pointer-events-none absolute left-2 top-2 grid grid-cols-2 gap-x-3 gap-y-0.5 rounded-lg bg-slate-950/70 px-3 py-2 text-xs text-slate-100 sm:grid-cols-4">
          <dt className="text-slate-400">{t('room.temp')}</dt>
          <dd className="tabular-nums">{fmtTemp(v.tempC)}</dd>
          <dt className="text-slate-400">{t('room.light')}</dt>
          <dd className="tabular-nums">
            {fmtPct(v.lightPct)} · {fmtKelvin(v.kelvin)}
          </dd>
          <dt className="text-slate-400">{t('room.sound')}</dt>
          <dd className="tabular-nums">
            {fmtPct(v.soundPct)} · {tk('soundscape', v.soundscape)}
          </dd>
          <dt className="text-slate-400">{t('room.aroma')}</dt>
          <dd className="tabular-nums">
            {v.aromaOn ? `${tk('aroma', v.aromaType)} ${fmtPct(v.aromaPct)}` : t('common.off')}
          </dd>
        </dl>
        <p className="pointer-events-none absolute bottom-2 right-3 text-xs text-slate-300">
          {t('room.orbitHint')}
        </p>
      </div>
    </section>
  );
}
