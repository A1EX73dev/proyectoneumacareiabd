import { useState, type KeyboardEvent } from 'react';
import { isOverrideActive } from '../../core/policy/priorities';
import { DEVICE_RANGES, patientFlags, rulesFor } from '../../core/policy/protocols';
import { formatHHmm } from '../../core/time';
import {
  AROMA_TYPES,
  PROTOCOL_IDS,
  SOUNDSCAPES,
  type AromaType,
  type Room,
  type Soundscape,
  type ToolResult,
} from '../../core/types';
import { manual, setAuto, simulateAlarm, simulateCura, simulateNoise } from '../actions';
import { RangeField } from '../common/RangeField';
import { Switch } from '../common/Switch';
import { fmtDb, fmtKelvin, fmtLux, fmtPct, fmtTemp, PROTOCOL_COLORS } from '../format';
import { useApp, useT } from '../hooks';
import { PatientPanel } from '../patient/PatientPanel';
import { DecisionLog } from './DecisionLog';
import { useSoundscapeAudio } from './useSoundscapeAudio';

type Tab = 'controls' | 'patient' | 'log';
const TABS: Tab[] = ['controls', 'patient', 'log'];

function Controls({ room }: { room: Room }) {
  const { t, tk } = useT();
  const nowMin = useApp((s) => s.clock.nowMin);
  const [status, setStatus] = useState<string | null>(null);
  const [audioOn, setAudioOn] = useState(false);
  const target = room.target ?? room.values;
  const audio = useSoundscapeAudio(audioOn, room.values.soundscape, room.values.soundPct);
  const aromaBlocked = patientFlags(room.patientForm).aromaBlocked;
  const rules = rulesFor(room.category, room.protocol);
  const active = isOverrideActive(room.override, nowMin) ? room.override : null;
  const id = (name: string) => `${name}-${room.id}`;

  function report(result: ToolResult) {
    setStatus(result.ok ? t('room.applied') : result.error);
  }

  return (
    <div className="space-y-5">
      <Switch
        id={id('auto')}
        checked={room.auto}
        label={t('room.aiMode')}
        description={t('room.aiModeHint')}
        onChange={(on) => report(setAuto(room.id, on))}
      />

      <div className="rounded-lg bg-slate-50 p-3 text-sm ring-1 ring-slate-200" aria-live="polite">
        {active ? (
          <p>
            <span className="font-semibold">{t('room.activeEvent')}:</span> {active.label} ·{' '}
            {t('room.priorityN', {
              n: active.priority,
              label: tk('priority', String(active.priority)),
            })}
            {active.endMin !== null && ` · ${t('room.until', { time: formatHHmm(active.endMin) })}`}
          </p>
        ) : (
          <p>{t('room.noEvent')}</p>
        )}
        {room.target && <p className="mt-1 text-xs text-slate-600">{t('room.ramping')}</p>}
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-900">{t('room.protocols')}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
          {PROTOCOL_IDS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={room.protocol === p}
              onClick={() => report(manual('apply_protocol', { room: room.id, protocol: p }))}
              className={`rounded-lg px-2 py-2 text-xs font-semibold text-slate-900 ring-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${
                room.protocol === p
                  ? 'ring-2 ring-slate-900'
                  : 'ring-slate-300 hover:ring-slate-500'
              }`}
              style={{ backgroundColor: `${PROTOCOL_COLORS[p]}${room.protocol === p ? '' : '66'}` }}
            >
              {tk('protocol', p)}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-4">
        <RangeField
          id={id('temp')}
          label={t('room.temp')}
          min={DEVICE_RANGES.tempC[0]}
          max={DEVICE_RANGES.tempC[1]}
          step={0.5}
          value={target.tempC}
          current={room.values.tempC}
          currentLabel={t('room.current')}
          format={fmtTemp}
          onCommit={(value) => report(manual('set_temperature', { room: room.id, value }))}
        />
        <RangeField
          id={id('light')}
          label={t('room.light')}
          min={DEVICE_RANGES.lightPct[0]}
          max={DEVICE_RANGES.lightPct[1]}
          step={1}
          value={target.lightPct}
          current={room.values.lightPct}
          currentLabel={t('room.current')}
          format={fmtPct}
          onCommit={(pct) => report(manual('set_light', { room: room.id, pct }))}
        />
        <RangeField
          id={id('kelvin')}
          label={t('room.kelvin')}
          min={DEVICE_RANGES.kelvin[0]}
          max={DEVICE_RANGES.kelvin[1]}
          step={100}
          value={target.kelvin}
          current={room.values.kelvin}
          currentLabel={t('room.current')}
          format={fmtKelvin}
          onCommit={(kelvin) => report(manual('set_light', { room: room.id, kelvin }))}
        />
        <RangeField
          id={id('sound')}
          label={t('room.volume')}
          min={DEVICE_RANGES.soundPct[0]}
          max={DEVICE_RANGES.soundPct[1]}
          step={1}
          value={target.soundPct}
          current={room.values.soundPct}
          currentLabel={t('room.current')}
          format={fmtPct}
          onCommit={(pct) => report(manual('set_sound', { room: room.id, pct }))}
        />
        <div className="space-y-1">
          <label htmlFor={id('scape')} className="text-sm font-medium text-slate-800">
            {t('room.soundscape')}
          </label>
          <select
            id={id('scape')}
            value={target.soundscape}
            onChange={(e) =>
              report(
                manual('set_sound', { room: room.id, soundscape: e.target.value as Soundscape }),
              )
            }
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
          >
            {SOUNDSCAPES.map((s) => (
              <option key={s} value={s}>
                {tk('soundscape', s)}
                {rules.soundscapes.includes(s) ? '' : ` (${t('room.outOfProfile')})`}
              </option>
            ))}
          </select>
          <Switch
            id={id('audio')}
            checked={audioOn}
            disabled={!audio.supported}
            label={t('room.listen')}
            description={audio.supported ? t('room.listenHint') : t('room.audioUnsupported')}
            onChange={setAudioOn}
          />
          {audio.error && <p className="text-xs text-red-800">{t('room.audioError')}</p>}
        </div>

        <div className="space-y-3 rounded-lg p-3 ring-1 ring-slate-200">
          <Switch
            id={id('aroma')}
            checked={target.aromaOn}
            disabled={aromaBlocked}
            label={t('room.aroma')}
            description={aromaBlocked ? t('room.aromaBlocked') : undefined}
            onChange={(on) => report(manual('set_aroma', { room: room.id, on }))}
          />
          <RangeField
            id={id('aromaPct')}
            label={t('room.aromaIntensity')}
            min={DEVICE_RANGES.aromaPct[0]}
            max={DEVICE_RANGES.aromaPct[1]}
            step={1}
            value={target.aromaPct}
            current={room.values.aromaPct}
            currentLabel={t('room.current')}
            format={fmtPct}
            disabled={aromaBlocked || !target.aromaOn}
            onCommit={(pct) => report(manual('set_aroma', { room: room.id, on: true, pct }))}
          />
          <div className="space-y-1">
            <label htmlFor={id('aromaType')} className="text-sm font-medium text-slate-800">
              {t('room.aromaType')}
            </label>
            <select
              id={id('aromaType')}
              value={target.aromaType}
              disabled={aromaBlocked}
              onChange={(e) =>
                report(
                  manual('set_aroma', {
                    room: room.id,
                    on: target.aromaOn,
                    type: e.target.value as AromaType,
                  }),
                )
              }
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
            >
              {AROMA_TYPES.map((a) => (
                <option key={a} value={a}>
                  {tk('aroma', a)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-slate-600">{t('room.manualNote')}</p>
      </div>

      {status && (
        <p role="status" className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-800">
          {status}
        </p>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">{t('room.readings')}</h3>
        <dl className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
            <dt className="text-xs text-slate-600">{t('room.readTemp')}</dt>
            <dd className="font-mono tabular-nums">{fmtTemp(room.readings.tempC)}</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
            <dt className="text-xs text-slate-600">{t('room.readNoise')}</dt>
            <dd className="font-mono tabular-nums">{fmtDb(room.readings.noiseDb)}</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
            <dt className="text-xs text-slate-600">{t('room.readLux')}</dt>
            <dd className="font-mono tabular-nums">{fmtLux(room.readings.lux)}</dd>
          </div>
        </dl>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">{t('room.simulate')}</h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void simulateNoise(room.id)}
            className="rounded-md bg-indigo-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
          >
            {t('room.simNoise')}
          </button>
          <button
            type="button"
            onClick={() => void simulateCura(room.id)}
            className="rounded-md bg-rose-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700"
          >
            {t('room.simCura')}
          </button>
          <button
            type="button"
            onClick={() => void simulateAlarm(room.id)}
            className="rounded-md bg-red-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800"
          >
            {t('room.simAlarm')}
          </button>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">{t('log.recent')}</h3>
        <DecisionLog entries={room.log.slice(0, 6)} />
      </div>
    </div>
  );
}

export function RoomMenu({ roomId }: { roomId: string }) {
  const { t, tk } = useT();
  const room = useApp((s) => s.rooms[roomId]);
  const [tab, setTab] = useState<Tab>('controls');
  if (!room) return null;

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = TABS.indexOf(tab);
    const next =
      TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length] ?? 'controls';
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  }

  return (
    <section
      aria-labelledby="menu-title"
      className="rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="border-b border-slate-200 px-4 pt-3">
        <h2 id="menu-title" className="text-base font-semibold text-slate-900">
          {t('menu.title', { room: room.id })}
        </h2>
        <div role="tablist" aria-label={t('menu.tabs')} className="mt-2 flex gap-1">
          {TABS.map((id) => (
            <button
              key={id}
              id={`tab-${id}`}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              onClick={() => setTab(id)}
              onKeyDown={onTabKey}
              className={`rounded-t-md px-3 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 ${
                tab === id ? 'bg-teal-700 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {tk('menu', id)}
            </button>
          ))}
        </div>
      </div>
      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="p-4">
        {tab === 'controls' && <Controls room={room} />}
        {tab === 'patient' && <PatientPanel key={room.id} roomId={room.id} />}
        {tab === 'log' && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900">{t('log.title')}</h3>
            <DecisionLog entries={room.log} />
          </div>
        )}
      </div>
    </section>
  );
}
