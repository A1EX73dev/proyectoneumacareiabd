import { useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  BED_DEVICE_RANGE,
  BED_PRESETS,
  bedGoal,
  bedLimits,
  describeBedLimits,
} from '../../core/policy/bed';
import { isOverrideActive } from '../../core/policy/priorities';
import { DEVICE_RANGES, patientFlags, rulesFor } from '../../core/policy/protocols';
import { formatHHmm } from '../../core/time';
import {
  AROMA_TYPES,
  BED_POSITIONS,
  PROTOCOL_IDS,
  SOUNDSCAPES,
  type AromaType,
  type Room,
  type Soundscape,
  type ToolResult,
} from '../../core/types';
import { manual, setAuto, simulateAlarm, simulateCura, simulateNoise } from '../actions';
import { Icon, type IconName } from '../common/Icon';
import { RangeField } from '../common/RangeField';
import { Switch } from '../common/Switch';
import {
  fmtDb,
  fmtDeg,
  fmtKelvin,
  fmtLux,
  fmtPct,
  fmtTemp,
  PRIORITY_BADGE,
  PROTOCOL_COLORS,
} from '../format';
import { useApp, useT } from '../hooks';
import { PatientPanel } from '../patient/PatientPanel';
import { DecisionLog } from './DecisionLog';
import { useSoundscapeAudio } from './useSoundscapeAudio';

type Tab = 'controls' | 'patient' | 'log';
const TABS: Tab[] = ['controls', 'patient', 'log'];
const TAB_ICONS: Record<Tab, IconName> = { controls: 'sliders', patient: 'user', log: 'list' };

function Section({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 border-t border-slate-100 pt-4 first:border-t-0 first:pt-0">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Icon name={icon} className="h-4 w-4 text-slate-500" />
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Perfil lateral de la cama con el ángulo del respaldo (y el rango permitido sombreado). */
function BedGlyph({ deg, min, max }: { deg: number; min: number; max: number }) {
  const hinge = { x: 58, y: 44 };
  const len = 40;
  const end = (a: number) => {
    const r = (a * Math.PI) / 180;
    return { x: hinge.x - len * Math.cos(r), y: hinge.y - len * Math.sin(r) };
  };
  const arc = (a: number, b: number, radius: number) => {
    const ra = (a * Math.PI) / 180;
    const rb = (b * Math.PI) / 180;
    const p1 = { x: hinge.x - radius * Math.cos(ra), y: hinge.y - radius * Math.sin(ra) };
    const p2 = { x: hinge.x - radius * Math.cos(rb), y: hinge.y - radius * Math.sin(rb) };
    return `M${hinge.x} ${hinge.y} L${p1.x} ${p1.y} A${radius} ${radius} 0 0 1 ${p2.x} ${p2.y} Z`;
  };
  const head = end(deg);
  return (
    <svg viewBox="0 0 120 64" className="h-16 w-28 shrink-0" aria-hidden="true">
      <path d={arc(min, max, 34)} fill="#ccfbf1" />
      <line
        x1={hinge.x}
        y1={hinge.y}
        x2={112}
        y2={hinge.y}
        stroke="#334155"
        strokeWidth={6}
        strokeLinecap="round"
      />
      <line
        x1={hinge.x}
        y1={hinge.y}
        x2={head.x}
        y2={head.y}
        stroke="#0f766e"
        strokeWidth={6}
        strokeLinecap="round"
      />
      <line x1={14} y1={50} x2={112} y2={50} stroke="#94a3b8" strokeWidth={2} />
      <circle cx={24} cy={58} r={4} fill="#64748b" />
      <circle cx={102} cy={58} r={4} fill="#64748b" />
    </svg>
  );
}

function BedControl({ room, report }: { room: Room; report: (r: ToolResult) => void }) {
  const { t, tk } = useT();
  const limits = bedLimits(room.patientForm);
  const goal = bedGoal(room.bed);
  const fixed = limits.min === limits.max;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
        <BedGlyph deg={room.bed.backrestDeg} min={limits.min} max={limits.max} />
        <div className="min-w-0 text-sm">
          <p className="font-semibold tabular-nums text-slate-900">
            {t('room.backrest')}: {fmtDeg(room.bed.backrestDeg)}
          </p>
          <p
            className={`mt-0.5 flex items-start gap-1 text-xs ${limits.restricted ? 'text-amber-900' : 'text-slate-600'}`}
          >
            {limits.restricted && <Icon name="lock" className="mt-px h-3.5 w-3.5" />}
            {limits.restricted
              ? t('room.bedAllowed', { limits: describeBedLimits(limits) })
              : t('room.bedFree')}
          </p>
          {room.bed.targetDeg !== null && (
            <p className="mt-0.5 text-xs text-teal-800">{t('room.bedMoving')}</p>
          )}
        </div>
      </div>
      <div role="group" aria-label={t('room.bed')} className="grid grid-cols-3 gap-1.5">
        {BED_POSITIONS.map((p) => {
          const deg = BED_PRESETS[p];
          const allowed = deg >= limits.min && deg <= limits.max;
          const active = Math.abs(goal - deg) < 1;
          return (
            <button
              key={p}
              type="button"
              aria-pressed={active}
              disabled={!allowed}
              onClick={() => report(manual('set_bed', { room: room.id, position: p }))}
              className={`flex flex-col items-center rounded-lg px-2 py-2 text-xs font-semibold ring-1 ring-inset transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-40 ${
                active
                  ? 'bg-teal-700 text-white ring-teal-700'
                  : 'bg-white text-slate-800 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              {tk('bedPosition', p)}
              <span
                className={`font-normal tabular-nums ${active ? 'text-teal-100' : 'text-slate-500'}`}
              >
                {fmtDeg(deg)}
              </span>
            </button>
          );
        })}
      </div>
      <RangeField
        id={`bed-${room.id}`}
        label={t('room.backrest')}
        min={BED_DEVICE_RANGE[0]}
        max={BED_DEVICE_RANGE[1]}
        step={5}
        value={goal}
        current={room.bed.backrestDeg}
        currentLabel={t('room.current')}
        format={fmtDeg}
        disabled={fixed}
        onCommit={(deg) => report(manual('set_bed', { room: room.id, deg }))}
      />
    </div>
  );
}

function Controls({ room }: { room: Room }) {
  const { t, tk } = useT();
  const nowMin = useApp((s) => s.clock.nowMin);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [audioOn, setAudioOn] = useState(false);
  const target = room.target ?? room.values;
  const audio = useSoundscapeAudio(audioOn, room.values.soundscape, room.values.soundPct);
  const aromaBlocked = patientFlags(room.patientForm).aromaBlocked;
  const rules = rulesFor(room.category, room.protocol);
  const active = isOverrideActive(room.override, nowMin) ? room.override : null;
  const id = (name: string) => `${name}-${room.id}`;

  function report(result: ToolResult) {
    setStatus(
      result.ok ? { ok: true, text: t('room.applied') } : { ok: false, text: result.error },
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
        <Switch
          id={id('auto')}
          checked={room.auto}
          label={t('room.aiMode')}
          description={t('room.aiModeHint')}
          onChange={(on) => report(setAuto(room.id, on))}
        />
        <div className="mt-3 border-t border-slate-200 pt-3 text-sm" aria-live="polite">
          {active ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-slate-900">{t('room.activeEvent')}:</span>
              <span className="text-slate-800">{active.label}</span>
              <span
                className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${PRIORITY_BADGE[active.priority]}`}
              >
                {t('room.priorityN', {
                  n: active.priority,
                  label: tk('priority', String(active.priority)),
                })}
              </span>
              {active.endMin !== null && (
                <span className="text-xs text-slate-600">
                  {t('room.until', { time: formatHHmm(active.endMin) })}
                </span>
              )}
            </div>
          ) : (
            <p className="text-slate-600">{t('room.noEvent')}</p>
          )}
          {room.target && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-teal-800">
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-600"
                aria-hidden="true"
              />
              {t('room.ramping')}
            </p>
          )}
        </div>
      </div>

      <Section icon="sparkles" title={t('room.protocols')}>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-2 2xl:grid-cols-4">
          {PROTOCOL_IDS.map((p) => {
            const on = room.protocol === p;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                onClick={() => report(manual('apply_protocol', { room: room.id, protocol: p }))}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold ring-1 ring-inset transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${
                  on
                    ? 'bg-slate-900 text-white ring-slate-900'
                    : 'bg-white text-slate-800 ring-slate-200 hover:bg-slate-50'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/40"
                  style={{ backgroundColor: PROTOCOL_COLORS[p] }}
                />
                {tk('protocol', p)}
              </button>
            );
          })}
        </div>
      </Section>

      <Section icon="bed" title={t('room.sectionBed')}>
        <BedControl room={room} report={report} />
      </Section>

      <Section icon="thermometer" title={t('room.sectionClimate')}>
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
      </Section>

      <Section icon="sun" title={t('room.sectionLight')}>
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
          id={id('blinds')}
          label={t('room.blinds')}
          min={0}
          max={100}
          step={5}
          value={target.blindsPct}
          current={room.values.blindsPct}
          currentLabel={t('room.current')}
          format={fmtPct}
          onCommit={(pct) => report(manual('set_blinds', { room: room.id, pct }))}
        />
      </Section>

      <Section icon="volume" title={t('room.sectionSound')}>
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
          <label htmlFor={id('scape')} className="field-label">
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
            className="field-input"
          >
            {SOUNDSCAPES.map((s) => (
              <option key={s} value={s}>
                {tk('soundscape', s)}
                {rules.soundscapes.includes(s) ? '' : ` (${t('room.outOfProfile')})`}
              </option>
            ))}
          </select>
        </div>
        <Switch
          id={id('audio')}
          checked={audioOn}
          disabled={!audio.supported}
          label={t('room.listen')}
          description={audio.supported ? t('room.listenHint') : t('room.audioUnsupported')}
          onChange={setAudioOn}
        />
        {audio.error && <p className="text-xs text-red-800">{t('room.audioError')}</p>}
      </Section>

      <Section icon="droplet" title={t('room.sectionAroma')}>
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
          <label htmlFor={id('aromaType')} className="field-label">
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
            className="field-input"
          >
            {AROMA_TYPES.map((a) => (
              <option key={a} value={a}>
                {tk('aroma', a)}
              </option>
            ))}
          </select>
        </div>
      </Section>

      <p className="field-hint">{t('room.manualNote')}</p>

      {status && (
        <p role="status" className={status.ok ? 'note-info' : 'note-danger'}>
          {status.text}
        </p>
      )}

      <Section icon="pulse" title={t('room.readings')}>
        <dl className="grid grid-cols-3 gap-2 text-center text-sm">
          {[
            [t('room.readTemp'), fmtTemp(room.readings.tempC)],
            [t('room.readNoise'), fmtDb(room.readings.noiseDb)],
            [t('room.readLux'), fmtLux(room.readings.lux)],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl bg-slate-50 px-2 py-2.5 ring-1 ring-inset ring-slate-200"
            >
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section icon="alert" title={t('room.simulate')}>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void simulateNoise(room.id)}
            className="btn btn-secondary btn-sm"
          >
            <Icon name="volume" className="h-3.5 w-3.5" />
            {t('room.simNoise')}
          </button>
          <button
            type="button"
            onClick={() => void simulateCura(room.id)}
            className="btn btn-secondary btn-sm"
          >
            <Icon name="plus" className="h-3.5 w-3.5" />
            {t('room.simCura')}
          </button>
          <button
            type="button"
            onClick={() => void simulateAlarm(room.id)}
            className="btn btn-danger btn-sm"
          >
            <Icon name="bell" className="h-3.5 w-3.5" />
            {t('room.simAlarm')}
          </button>
        </div>
      </Section>

      <Section icon="list" title={t('log.recent')}>
        <DecisionLog entries={room.log.slice(0, 6)} />
      </Section>
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
      className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-8px_rgba(15,23,42,0.08)]"
    >
      <div className="border-b border-slate-100 px-5 pb-3 pt-4">
        <h2 id="menu-title" className="text-[15px] font-semibold text-slate-900">
          {t('menu.title', { room: room.id })}
        </h2>
        <div
          role="tablist"
          aria-label={t('menu.tabs')}
          className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1"
        >
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
              className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 ${
                tab === id
                  ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon name={TAB_ICONS[id]} className="h-4 w-4" />
              {tk('menu', id)}
            </button>
          ))}
        </div>
      </div>
      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="p-5">
        {tab === 'controls' && <Controls room={room} />}
        {tab === 'patient' && <PatientPanel key={room.id} roomId={room.id} />}
        {tab === 'log' && <DecisionLog entries={room.log} />}
      </div>
    </section>
  );
}
