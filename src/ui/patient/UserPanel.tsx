import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { bedGoal, bedLimits, BED_PRESETS } from '../../core/policy/bed';
import { patientFlags } from '../../core/policy/protocols';
import { formatHHmm } from '../../core/time';
import {
  AROMA_TYPES,
  BED_POSITIONS,
  SOUNDSCAPES,
  type Room,
  type ToolResult,
} from '../../core/types';
import { SPEECH_LANG, LANGS, type Lang } from '../../i18n';
import { appStore, setView } from '../../core/state';
import { changeLang, manual, sendUtterance, setAuto } from '../actions';
import { Icon, type IconName } from '../common/Icon';
import { fmtDeg, fmtPct, fmtTemp } from '../format';
import { useApp, useT } from '../hooks';
import { goAdmin, goUser } from '../route';
import { useVoice } from '../voice/useVoice';

/**
 * Panel de usuario (paciente): controla SOLO su habitación con botones grandes, voz o texto
 * y puede llamar a enfermería. No ve otros pacientes, ni el reloj de simulación, ni el registro
 * del agente. Todo pasa por las mismas funciones validadas que el panel de administración.
 */

function Tile({
  icon,
  title,
  value,
  children,
}: {
  icon: IconName;
  title: string;
  value?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Icon name={icon} className="h-5 w-5 text-teal-700" />
          {title}
        </h2>
        {value && <span className="text-2xl font-bold tabular-nums text-slate-900">{value}</span>}
      </header>
      {children}
    </section>
  );
}

const BIG =
  'flex min-h-[3.5rem] flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold ring-1 ring-inset transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-40';
const BIG_NEUTRAL = `${BIG} bg-white text-slate-900 ring-slate-300 hover:bg-slate-50`;
const BIG_ACTIVE = `${BIG} bg-teal-700 text-white ring-teal-700`;

function RoomPicker() {
  const { t } = useT();
  const rooms = useApp((s) => s.rooms);
  const ids = useApp((s) => s.roomIds);
  const occupied = ids.filter((id) => rooms[id]?.occupied);
  return (
    <section className="mx-auto max-w-2xl rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-xl font-semibold text-slate-900">{t('user.pickRoom')}</h2>
      {occupied.length === 0 ? (
        <p className="mt-3 text-slate-600">{t('user.noOccupied')}</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {occupied.map((id) => (
            <button key={id} type="button" onClick={() => goUser(id)} className={BIG_NEUTRAL}>
              {t('user.roomN', { room: id })}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function RoomControls({ room }: { room: Room }) {
  const { t, tk, lang } = useT();
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [text, setText] = useState('');
  const conversation = useApp((s) => s.agent.conversation);
  const thinking = useApp((s) => s.agent.pending > 0);
  const nowMin = useApp((s) => s.clock.nowMin);
  const reply = [...conversation].reverse().find((c) => c.who === 'agent')?.text ?? null;

  const form = room.patientForm;
  const name = form?.name.trim();
  const v = room.target ?? room.values;
  const limits = bedLimits(form);
  const goal = bedGoal(room.bed);
  const aromaBlocked = patientFlags(form).aromaBlocked;

  // Las órdenes de voz sin habitación se interpretan sobre ésta.
  useEffect(() => {
    appStore.setState((s) => setView(s, 'map', room.id));
  }, [room.id]);

  const voice = useVoice((spoken) => void sendUtterance(spoken, room.id), SPEECH_LANG[lang]);

  function run(name: string, args: Record<string, unknown>) {
    const result: ToolResult = manual(name, { room: room.id, ...args });
    setStatus(result.ok ? { ok: true, text: t('user.done') } : { ok: false, text: result.error });
  }

  function call(urgency: 'media' | 'alta') {
    const message = t(urgency === 'alta' ? 'user.callUrgentMsg' : 'user.callMsg', {
      room: room.id,
    });
    const result = manual('notify_staff', { room: room.id, message, urgency });
    setStatus(result.ok ? { ok: true, text: t('user.called') } : { ok: false, text: result.error });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    void sendUtterance(value, room.id);
    setText('');
  }

  const listening = voice.status === 'listening';

  return (
    <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-2">
      <section className="lg:col-span-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-teal-800">
              {t('user.roomN', { room: room.id })}
            </p>
            <h1 className="text-3xl font-bold text-slate-900">
              {name ? t('user.hello', { name }) : t('user.helloAnon')}
            </h1>
            <p className="mt-1 text-slate-600">
              {t('user.now', {
                time: formatHHmm(nowMin),
                temp: fmtTemp(room.readings.tempC),
                protocol: tk('protocol', room.protocol),
              })}
            </p>
          </div>
          <button type="button" onClick={() => goUser(null)} className="btn btn-secondary">
            {t('user.changeRoom')}
          </button>
        </div>
        {room.auto ? (
          <p className="mt-3 rounded-xl bg-teal-50 px-4 py-2 text-sm text-teal-900 ring-1 ring-teal-200">
            {t('user.autoOn')}
          </p>
        ) : (
          <p className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-950 ring-1 ring-amber-200">
            {t('user.autoOff')}
            <button
              type="button"
              className="btn btn-secondary py-1"
              onClick={() => setAuto(room.id, true)}
            >
              {t('user.autoBack')}
            </button>
          </p>
        )}
      </section>

      <section className="grid gap-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 lg:col-span-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => call('media')}
          className={`${BIG} bg-teal-700 text-lg text-white ring-teal-700 hover:bg-teal-800`}
        >
          <Icon name="bell" className="h-6 w-6" />
          {t('user.call')}
        </button>
        <button
          type="button"
          onClick={() => call('alta')}
          className={`${BIG} bg-red-700 text-lg text-white ring-red-700 hover:bg-red-800`}
        >
          <Icon name="alert" className="h-6 w-6" />
          {t('user.callUrgent')}
        </button>
      </section>

      <Tile icon="thermometer" title={t('user.temp')} value={fmtTemp(v.tempC)}>
        <div className="flex gap-3">
          <button
            type="button"
            className={BIG_NEUTRAL}
            onClick={() => run('set_temperature', { delta: -1 })}
          >
            − {t('user.cooler')}
          </button>
          <button
            type="button"
            className={BIG_NEUTRAL}
            onClick={() => run('set_temperature', { delta: 1 })}
          >
            + {t('user.warmer')}
          </button>
        </div>
      </Tile>

      <Tile icon="sun" title={t('user.light')} value={fmtPct(v.lightPct)}>
        <div className="flex gap-3">
          <button
            type="button"
            className={BIG_NEUTRAL}
            onClick={() => run('set_light', { deltaPct: -15 })}
          >
            − {t('user.dimmer')}
          </button>
          <button
            type="button"
            className={BIG_NEUTRAL}
            onClick={() => run('set_light', { deltaPct: 15 })}
          >
            + {t('user.brighter')}
          </button>
        </div>
        <div className="mt-3 flex gap-3">
          <button
            type="button"
            className={BIG_NEUTRAL}
            onClick={() => run('set_light', { deltaKelvin: -500 })}
          >
            {t('user.warmLight')}
          </button>
          <button
            type="button"
            className={BIG_NEUTRAL}
            onClick={() => run('set_light', { deltaKelvin: 500 })}
          >
            {t('user.coolLight')}
          </button>
        </div>
      </Tile>

      <Tile icon="blinds" title={t('user.blinds')} value={fmtPct(v.blindsPct)}>
        <div className="flex gap-3">
          <button
            type="button"
            className={BIG_NEUTRAL}
            onClick={() => run('set_blinds', { pct: 100 })}
          >
            {t('user.blindsUp')}
          </button>
          <button
            type="button"
            className={BIG_NEUTRAL}
            onClick={() => run('set_blinds', { pct: 50 })}
          >
            {t('user.blindsHalf')}
          </button>
          <button
            type="button"
            className={BIG_NEUTRAL}
            onClick={() => run('set_blinds', { pct: 0 })}
          >
            {t('user.blindsDown')}
          </button>
        </div>
      </Tile>

      <Tile icon="bed" title={t('user.bed')} value={fmtDeg(room.bed.backrestDeg)}>
        <div role="group" aria-label={t('user.bed')} className="flex gap-3">
          {BED_POSITIONS.map((p) => {
            const deg = BED_PRESETS[p];
            const allowed = deg >= limits.min && deg <= limits.max;
            const active = Math.abs(goal - deg) < 1;
            return (
              <button
                key={p}
                type="button"
                disabled={!allowed}
                aria-pressed={active}
                className={active ? BIG_ACTIVE : BIG_NEUTRAL}
                onClick={() => run('set_bed', { position: p })}
              >
                {tk('bedPosition', p)}
              </button>
            );
          })}
        </div>
        {limits.restricted && <p className="mt-3 text-sm text-slate-600">{t('user.bedLimited')}</p>}
      </Tile>

      <Tile icon="volume" title={t('user.sound')} value={tk('soundscape', v.soundscape)}>
        <div
          role="group"
          aria-label={t('user.sound')}
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
        >
          {SOUNDSCAPES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={v.soundscape === s}
              className={v.soundscape === s ? BIG_ACTIVE : BIG_NEUTRAL}
              onClick={() =>
                run('set_sound', {
                  soundscape: s,
                  ...(s !== 'silencio' && v.soundPct < 10 ? { pct: 30 } : {}),
                })
              }
            >
              {tk('soundscape', s)}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-3">
          <button
            type="button"
            className={BIG_NEUTRAL}
            onClick={() => run('set_sound', { deltaPct: -10 })}
          >
            − {t('user.quieter')}
          </button>
          <button
            type="button"
            className={BIG_NEUTRAL}
            onClick={() => run('set_sound', { deltaPct: 10 })}
          >
            + {t('user.louder')}
          </button>
        </div>
      </Tile>

      <Tile
        icon="info"
        title={t('user.aroma')}
        value={v.aromaOn ? t('common.on') : t('common.off')}
      >
        {aromaBlocked ? (
          <p className="text-slate-700">{t('user.aromaBlocked')}</p>
        ) : (
          <div className="flex gap-3">
            <button
              type="button"
              aria-pressed={v.aromaOn}
              className={v.aromaOn ? BIG_ACTIVE : BIG_NEUTRAL}
              onClick={() => run('set_aroma', { on: true, type: v.aromaType ?? AROMA_TYPES[0] })}
            >
              {t('common.on')}
            </button>
            <button
              type="button"
              aria-pressed={!v.aromaOn}
              className={!v.aromaOn ? BIG_ACTIVE : BIG_NEUTRAL}
              onClick={() => run('set_aroma', { on: false })}
            >
              {t('common.off')}
            </button>
          </div>
        )}
      </Tile>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 lg:col-span-2">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Icon name="mic" className="h-5 w-5 text-teal-700" />
          {t('user.ask')}
        </h2>
        <form onSubmit={onSubmit} className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!voice.supported}
            aria-pressed={listening}
            onClick={() => (listening ? voice.stop() : voice.start())}
            className={
              listening
                ? `${BIG} flex-none bg-red-700 text-white ring-red-700`
                : `${BIG_ACTIVE} flex-none`
            }
          >
            <Icon name="mic" className="h-5 w-5" />
            {listening ? t('voice.stop') : t('voice.speak')}
          </button>
          <label htmlFor="user-text" className="sr-only">
            {t('user.ask')}
          </label>
          <input
            id="user-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('user.askPlaceholder')}
            className="field-input min-w-[12rem] flex-1 py-3 text-base"
          />
          <button type="submit" className={`${BIG_NEUTRAL} flex-none`}>
            {t('voice.send')}
          </button>
        </form>
        <p
          role="status"
          aria-live="polite"
          className="mt-3 min-h-[1.5rem] text-base text-slate-800"
        >
          {thinking ? t('user.thinking') : reply}
        </p>
      </section>

      <p
        role="status"
        aria-live="polite"
        className={`lg:col-span-2 min-h-[1.5rem] text-base font-medium ${status && !status.ok ? 'text-red-800' : 'text-teal-800'}`}
      >
        {status?.text}
      </p>
    </div>
  );
}

export function UserPanel({ roomId }: { roomId: string | null }) {
  const { t, lang } = useT();
  const room = useApp((s) => (roomId ? s.rooms[roomId] : undefined));

  return (
    <div className="min-h-screen bg-slate-100 pb-16 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <p
          role="note"
          className="bg-amber-100 px-4 py-1 text-center text-xs font-medium text-amber-950"
        >
          {t('app.simulationBanner')}
        </p>
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="text-lg font-semibold">{t('user.title')}</span>
          <div className="flex items-center gap-3">
            <label htmlFor="user-lang" className="sr-only">
              {t('app.language')}
            </label>
            <select
              id="user-lang"
              value={lang}
              onChange={(e) => changeLang(e.target.value as Lang)}
              className="field-input w-auto py-1.5"
            >
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </select>
            <button type="button" onClick={goAdmin} className="btn btn-secondary py-1.5">
              {t('user.toAdmin')}
            </button>
          </div>
        </div>
      </header>
      <main className="p-4 md:p-6">
        {room?.occupied ? <RoomControls room={room} /> : <RoomPicker />}
      </main>
    </div>
  );
}
