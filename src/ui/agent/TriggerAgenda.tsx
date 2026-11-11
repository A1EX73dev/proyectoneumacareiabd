import { useState, type FormEvent } from 'react';
import { TRIGGER_PROFILES } from '../../core/policy/triggerProfiles';
import { ROOM_IDS, TRIGGER_TYPES, type Trigger, type TriggerType } from '../../core/types';
import { fireNow, manual } from '../actions';
import { Card } from '../common/Card';
import { useApp, useT } from '../hooks';

interface Draft {
  id: string | null;
  type: TriggerType;
  room: string;
  time: string;
  repeat: 'daily' | 'once';
  durationMin: number;
  enabled: boolean;
}

const NEW_DRAFT: Draft = {
  id: null,
  type: 'medicacion',
  room: 'all',
  time: '14:00',
  repeat: 'daily',
  durationMin: TRIGGER_PROFILES.medicacion.defaultDuration,
  enabled: true,
};

const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600';

export function TriggerAgenda() {
  const { t, tk } = useT();
  const triggers = useApp((s) => s.triggers);
  const selectedRoom = useApp((s) => s.ui.selectedRoom);
  const [draft, setDraft] = useState<Draft>(NEW_DRAFT);
  const [status, setStatus] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [fireRoom, setFireRoom] = useState<string>('all');

  const roomLabel = (room: string) => (room === 'all' ? t('common.allFloor') : room);

  function edit(trigger: Trigger) {
    setDraft({
      id: trigger.id,
      type: trigger.type,
      room: trigger.roomId,
      time: trigger.time,
      repeat: trigger.repeat,
      durationMin: trigger.durationMin,
      enabled: trigger.enabled,
    });
    setStatus(null);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const args: Record<string, unknown> = {
      type: draft.type,
      room: draft.room,
      time: draft.time,
      repeat: draft.repeat,
      durationMin: draft.durationMin,
      enabled: draft.enabled,
    };
    if (draft.id) args.id = draft.id;
    const r = manual('schedule_trigger', args, t('reason.agendaUi'));
    setStatus(r.ok ? (draft.id ? t('agenda.updated') : t('agenda.created')) : r.error);
    if (r.ok) setDraft(NEW_DRAFT);
  }

  function toggle(trigger: Trigger) {
    const r = manual(
      'schedule_trigger',
      { id: trigger.id, enabled: !trigger.enabled },
      t('reason.agendaUi'),
    );
    if (!r.ok) setStatus(r.error);
  }

  function remove(trigger: Trigger) {
    if (pendingDelete !== trigger.id) {
      setPendingDelete(trigger.id);
      return;
    }
    const r = manual('cancel_trigger', { id: trigger.id }, t('reason.agendaUi'));
    setPendingDelete(null);
    setStatus(r.ok ? t('agenda.deleted') : r.error);
    if (draft.id === trigger.id) setDraft(NEW_DRAFT);
  }

  const fireTarget =
    fireRoom === 'selected' && selectedRoom
      ? selectedRoom
      : fireRoom === 'selected'
        ? 'all'
        : fireRoom;

  return (
    <Card title={t('agenda.title')} titleId="agenda-title" icon="calendar">
      <div className="space-y-4">
        <div className="max-h-[22rem] overflow-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[26rem] text-left text-xs">
            <caption className="sr-only">{t('agenda.title')}</caption>
            <thead className="sticky top-0 bg-slate-100 text-slate-700">
              <tr>
                <th scope="col" className="px-2 py-1.5">
                  {t('agenda.time')}
                </th>
                <th scope="col" className="px-2 py-1.5">
                  {t('agenda.type')}
                </th>
                <th scope="col" className="px-2 py-1.5">
                  {t('agenda.room')}
                </th>
                <th scope="col" className="px-2 py-1.5">
                  {t('agenda.duration')}
                </th>
                <th scope="col" className="px-2 py-1.5">
                  {t('agenda.enabled')}
                </th>
                <th scope="col" className="px-2 py-1.5">
                  <span className="sr-only">{t('agenda.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {triggers.map((tr) => (
                <tr
                  key={tr.id}
                  className={`border-t border-slate-200 ${tr.enabled ? '' : 'text-slate-500'}`}
                >
                  <td className="px-2 py-1.5 font-mono tabular-nums">{tr.time}</td>
                  <td className="px-2 py-1.5">
                    {tk('trigger', tr.type)}
                    {tr.repeat === 'once' && (
                      <span className="ml-1 text-slate-500">({t('agenda.once')})</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">{roomLabel(tr.roomId)}</td>
                  <td className="px-2 py-1.5 tabular-nums">{tr.durationMin} min</td>
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={tr.enabled}
                      onChange={() => toggle(tr)}
                      aria-label={t('agenda.toggleAria', {
                        type: tk('trigger', tr.type),
                        time: tr.time,
                      })}
                      className="h-4 w-4 accent-teal-600"
                    />
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => edit(tr)}
                      className="rounded px-1.5 py-0.5 font-medium text-teal-800 hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
                    >
                      {t('agenda.edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(tr)}
                      onBlur={() => setPendingDelete((p) => (p === tr.id ? null : p))}
                      className={`ml-1 rounded px-1.5 py-0.5 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-700 ${
                        pendingDelete === tr.id
                          ? 'bg-red-700 text-white'
                          : 'text-red-800 hover:bg-red-50'
                      }`}
                    >
                      {pendingDelete === tr.id ? t('agenda.confirmDelete') : t('agenda.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form onSubmit={onSubmit} className="space-y-2 rounded-lg p-3 ring-1 ring-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">
            {draft.id ? t('agenda.editTitle') : t('agenda.newTitle')}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label htmlFor="ag-type" className="text-xs font-medium text-slate-800">
                {t('agenda.type')}
              </label>
              <select
                id="ag-type"
                value={draft.type}
                onChange={(e) => {
                  const type = e.target.value as TriggerType;
                  setDraft((d) => ({
                    ...d,
                    type,
                    durationMin: TRIGGER_PROFILES[type].defaultDuration,
                  }));
                }}
                className={inputClass}
              >
                {TRIGGER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {tk('trigger', type)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="ag-room" className="text-xs font-medium text-slate-800">
                {t('agenda.room')}
              </label>
              <select
                id="ag-room"
                value={draft.room}
                onChange={(e) => setDraft((d) => ({ ...d, room: e.target.value }))}
                className={inputClass}
              >
                <option value="all">{t('common.allFloor')}</option>
                {ROOM_IDS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="ag-time" className="text-xs font-medium text-slate-800">
                {t('agenda.time')}
              </label>
              <input
                id="ag-time"
                type="time"
                required
                value={draft.time}
                onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="ag-duration" className="text-xs font-medium text-slate-800">
                {t('agenda.durationMin')}
              </label>
              <input
                id="ag-duration"
                type="number"
                min={1}
                max={720}
                value={draft.durationMin}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, durationMin: Number(e.target.value) || 1 }))
                }
                className={inputClass}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="ag-repeat" className="text-xs font-medium text-slate-800">
                {t('agenda.repeat')}
              </label>
              <select
                id="ag-repeat"
                value={draft.repeat}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, repeat: e.target.value as Draft['repeat'] }))
                }
                className={inputClass}
              >
                <option value="daily">{t('agenda.daily')}</option>
                <option value="once">{t('agenda.once')}</option>
              </select>
            </div>
            <div className="flex items-end gap-2 pb-1.5">
              <input
                id="ag-enabled"
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))}
                className="h-4 w-4 accent-teal-600"
              />
              <label htmlFor="ag-enabled" className="text-xs font-medium text-slate-800">
                {t('agenda.enabled')}
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              {draft.id ? t('agenda.save') : t('agenda.create')}
            </button>
            {draft.id && (
              <button
                type="button"
                onClick={() => setDraft(NEW_DRAFT)}
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

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">{t('agenda.fireNow')}</h3>
            <label htmlFor="fire-room" className="sr-only">
              {t('agenda.fireRoom')}
            </label>
            <select
              id="fire-room"
              value={fireRoom}
              onChange={(e) => setFireRoom(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
            >
              <option value="all">{t('common.allFloor')}</option>
              {selectedRoom && (
                <option value="selected">{t('agenda.selectedRoom', { room: selectedRoom })}</option>
              )}
              {ROOM_IDS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TRIGGER_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => void fireNow(type, fireTarget)}
                className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
              >
                {tk('trigger', type)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
