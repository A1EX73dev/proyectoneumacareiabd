import { useState, type FormEvent } from 'react';
import { dayOf, formatHHmm, isValidHHmm } from '../../core/time';
import { SIM_SPEEDS, type SimSpeed } from '../../core/types';
import { LANGS, type Lang } from '../../i18n';
import { changeLang, changeSpeed, jumpTo } from '../actions';
import { Icon } from '../common/Icon';
import { useApp, useT } from '../hooks';
import { openAdmitDialog } from '../overlay';

function speedLabel(speed: SimSpeed, pause: string): string {
  return speed === 0 ? pause : `${speed}×`;
}

/** Marca de la aplicación: cruz sanitaria sobre fondo verde azulado. */
function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-teal-800 shadow-sm"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="white">
        <path d="M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z" />
      </svg>
    </span>
  );
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
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <p
        role="note"
        className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-1 text-center text-xs font-medium text-amber-950"
      >
        <Icon name="info" className="h-3.5 w-3.5" />
        {t('app.simulationBanner')}
      </p>
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark />
          <div className="min-w-0">
            <h1 className="text-base font-semibold leading-5 tracking-tight text-slate-900">
              {t('app.title')}
            </h1>
            <p className="text-xs text-slate-500">{t('app.subtitle')}</p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2 md:gap-3">
          <div
            className="flex items-center gap-2.5 rounded-xl bg-slate-900 px-3 py-1.5 text-white"
            aria-label={t('clock.label')}
            role="group"
          >
            <Icon name="clock" className="h-4 w-4 text-teal-300" />
            <time
              className="font-mono text-lg font-semibold tabular-nums leading-none"
              aria-live="off"
            >
              {formatHHmm(nowMin)}
            </time>
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              {t('clock.day', { day: dayOf(nowMin) + 1 })}
            </span>
          </div>

          <div
            role="group"
            aria-label={t('clock.speed')}
            className="flex rounded-xl bg-slate-100 p-0.5 ring-1 ring-inset ring-slate-200"
          >
            {SIM_SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={speed === s}
                onClick={() => changeSpeed(s)}
                className={`rounded-[10px] px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 ${
                  speed === s
                    ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {speedLabel(s, t('clock.pause'))}
              </button>
            ))}
          </div>

          <form onSubmit={onJump} className="flex items-center gap-1">
            <label htmlFor="jump-time" className="sr-only">
              {t('clock.jumpTo')}
            </label>
            <input
              id="jump-time"
              type="time"
              value={jump}
              onChange={(e) => setJump(e.target.value)}
              className="field-input w-[6.5rem] py-1.5"
            />
            <button type="submit" className="btn btn-secondary py-1.5">
              {t('clock.go')}
            </button>
          </form>

          <div className="flex items-center gap-1.5">
            <label htmlFor="lang" className="sr-only">
              {t('app.language')}
            </label>
            <Icon name="globe" className="h-4 w-4 text-slate-500" />
            <select
              id="lang"
              value={lang}
              onChange={(e) => changeLang(e.target.value as Lang)}
              className="field-input w-auto py-1.5"
            >
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {tk('lang', l)}
                </option>
              ))}
            </select>
          </div>

          <button type="button" onClick={() => openAdmitDialog()} className="btn btn-primary">
            <Icon name="userPlus" />
            {t('admit.open')}
          </button>
        </div>
      </div>
    </header>
  );
}
