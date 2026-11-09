import { useState, type FormEvent } from 'react';
import { dayOf, formatHHmm, isValidHHmm } from '../../core/time';
import { SIM_SPEEDS, type SimSpeed } from '../../core/types';
import { LANGS, type Lang } from '../../i18n';
import { changeLang, changeSpeed, jumpTo } from '../actions';
import { useApp, useT } from '../hooks';

function speedLabel(speed: SimSpeed, pause: string): string {
  return speed === 0 ? pause : `${speed}×`;
}

export function Header() {
  const { t, tk, lang } = useT();
  const nowMin = useApp((s) => s.clock.nowMin);
  const speed = useApp((s) => s.clock.speed);
  const [jump, setJump] = useState('06:00');

  function onJump(e: FormEvent) {
    e.preventDefault();
    if (isValidHHmm(jump)) void jumpTo(jump);
  }

  return (
    <header className="bg-slate-900 text-white">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">{t('app.title')}</h1>
          <p className="text-xs text-slate-300">{t('app.subtitle')}</p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div className="flex items-baseline gap-2" aria-label={t('clock.label')}>
            <span className="text-xs uppercase tracking-wide text-slate-400">
              {t('clock.day', { day: dayOf(nowMin) + 1 })}
            </span>
            <time className="font-mono text-2xl tabular-nums" aria-live="off">
              {formatHHmm(nowMin)}
            </time>
          </div>

          <div
            role="group"
            aria-label={t('clock.speed')}
            className="flex overflow-hidden rounded-lg ring-1 ring-slate-600"
          >
            {SIM_SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={speed === s}
                onClick={() => changeSpeed(s)}
                className={`px-2.5 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-300 ${
                  speed === s
                    ? 'bg-teal-500 text-slate-950'
                    : 'bg-slate-800 text-slate-100 hover:bg-slate-700'
                }`}
              >
                {speedLabel(s, t('clock.pause'))}
              </button>
            ))}
          </div>

          <form onSubmit={onJump} className="flex items-center gap-1.5">
            <label htmlFor="jump-time" className="text-sm text-slate-300">
              {t('clock.jumpTo')}
            </label>
            <input
              id="jump-time"
              type="time"
              value={jump}
              onChange={(e) => setJump(e.target.value)}
              className="rounded-md bg-slate-800 px-2 py-1 text-sm text-white ring-1 ring-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"
            />
            <button
              type="submit"
              className="rounded-md bg-slate-700 px-2.5 py-1 text-sm font-medium hover:bg-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"
            >
              {t('clock.go')}
            </button>
          </form>

          <div className="flex items-center gap-1.5">
            <label htmlFor="lang" className="text-sm text-slate-300">
              {t('app.language')}
            </label>
            <select
              id="lang"
              value={lang}
              onChange={(e) => changeLang(e.target.value as Lang)}
              className="rounded-md bg-slate-800 px-2 py-1 text-sm text-white ring-1 ring-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"
            >
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {tk('lang', l)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <p
        role="note"
        className="bg-amber-300 px-4 py-1.5 text-center text-sm font-medium text-amber-950"
      >
        {t('app.simulationBanner')}
      </p>
    </header>
  );
}
