import { useState, type FormEvent } from 'react';
import { EMPTY_FORM } from '../../core/classify';
import { appStore } from '../../core/state';
import type { PatientForm, Room } from '../../core/types';
import { manual } from '../actions';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Icon } from '../common/Icon';
import { Modal } from '../common/Modal';
import { useApp, useT } from '../hooks';
import { closeAdmitDialog, pushToast, useOverlay } from '../overlay';
import { PatientFields, PatientSamples } from './PatientFields';

const FORM_ID = 'admit-form';

/** Primera habitación libre (o null si la planta está llena). */
function firstFreeRoom(rooms: Record<string, Room>, ids: string[]): string | null {
  return ids.find((id) => rooms[id] && !rooms[id].occupied) ?? null;
}

interface RoomPickerProps {
  value: string | null;
  onChange: (room: string) => void;
}

/** Selector de habitación: radios nativos con aspecto de tarjeta (teclado con flechas). */
function RoomPicker({ value, onChange }: RoomPickerProps) {
  const { t } = useT();
  const rooms = useApp((s) => s.rooms);
  const ids = useApp((s) => s.roomIds);
  const free = ids.filter((id) => rooms[id] && !rooms[id].occupied).length;

  return (
    <fieldset className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <legend className="eyebrow">{t('admit.sectionRoom')}</legend>
        <span className="text-xs text-slate-600">
          {t('admit.freeCount', { n: free, total: ids.length })}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {ids.map((id) => {
          const room = rooms[id];
          if (!room) return null;
          const checked = value === id;
          const name = room.patientForm?.name.trim();
          return (
            <label
              key={id}
              className={`relative flex cursor-pointer flex-col rounded-xl px-3 py-2.5 ring-1 ring-inset transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-teal-600 ${
                checked
                  ? 'bg-teal-50 ring-2 ring-teal-600'
                  : 'bg-white ring-slate-200 hover:bg-slate-50 hover:ring-slate-300'
              }`}
            >
              <input
                type="radio"
                name="admit-room"
                value={id}
                checked={checked}
                onChange={() => onChange(id)}
                className="sr-only"
              />
              <span className="flex items-center justify-between gap-1">
                <span className="text-base font-semibold tabular-nums text-slate-900">{id}</span>
                {checked && <Icon name="check" className="h-4 w-4 text-teal-700" />}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-600">
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full ${room.occupied ? 'bg-slate-400' : 'bg-emerald-500'}`}
                />
                {room.occupied ? t('admit.roomOccupied') : t('admit.roomFree')}
              </span>
              {name && <span className="mt-0.5 truncate text-xs text-slate-500">{name}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

interface AdmitFormProps {
  initialRoom: string | null;
  open: boolean;
}

function AdmitForm({ initialRoom, open }: AdmitFormProps) {
  const { t, tk } = useT();
  const rooms = useApp((s) => s.rooms);
  const [room, setRoom] = useState<string | null>(
    () => initialRoom ?? firstFreeRoom(appStore.getState().rooms, appStore.getState().roomIds),
  );
  const [form, setForm] = useState<PatientForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const occupied = room ? (rooms[room]?.occupied ?? false) : false;

  function admit(replace: boolean) {
    if (!room) return;
    const result = manual('admit_patient', { room, form, replace }, t('reason.admitUi'));
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const admitted = appStore.getState().rooms[room];
    closeAdmitDialog();
    pushToast({
      tone: 'success',
      title: t('admit.success', { room }),
      detail: admitted?.category
        ? t('admit.successDetail', {
            category: tk('category', admitted.category),
            protocol: tk('protocol', admitted.protocol),
          })
        : undefined,
      room,
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!room) {
      setError(t('admit.noRoom'));
      return;
    }
    setError(null);
    if (occupied) setConfirmReplace(true);
    else admit(false);
  }

  return (
    <>
      <Modal
        open={open}
        onClose={closeAdmitDialog}
        title={t('admit.title')}
        titleId="admit-title"
        description={t('admit.description')}
        closeLabel={t('common.close')}
        icon={
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white">
            <Icon name="userPlus" className="h-5 w-5" />
          </span>
        }
        footer={
          <>
            <p className="mr-auto flex max-w-sm items-start gap-1.5 text-xs text-slate-600">
              <Icon name="shield" className="mt-px h-3.5 w-3.5 text-teal-700" />
              {t('patient.privacy')}
            </p>
            <button type="button" onClick={closeAdmitDialog} className="btn btn-secondary">
              {t('common.cancel')}
            </button>
            <button type="submit" form={FORM_ID} disabled={!room} className="btn btn-primary">
              <Icon name="userPlus" />
              {room ? t('admit.submit', { room }) : t('admit.submitNoRoom')}
            </button>
          </>
        }
      >
        <form id={FORM_ID} onSubmit={onSubmit} noValidate className="space-y-6">
          <RoomPicker
            value={room}
            onChange={(id) => {
              setRoom(id);
              setError(null);
            }}
          />
          {room && occupied && (
            <p className="note-warning flex items-start gap-2">
              <Icon name="alert" className="mt-0.5 h-4 w-4" />
              {t('admit.occupiedHint', { room })}
            </p>
          )}

          <div className="space-y-4 border-t border-slate-200 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="eyebrow">{t('admit.sectionPatient')}</h3>
              <PatientSamples onPick={(sample) => setForm({ ...sample, name: form.name })} />
            </div>
            <PatientFields form={form} onChange={setForm} idPrefix="admit" />
          </div>

          {error && (
            <p role="alert" className="note-danger flex items-start gap-2">
              <Icon name="alert" className="mt-0.5 h-4 w-4" />
              <span>
                <strong className="font-semibold">{t('admit.error')}.</strong> {error}
              </span>
            </p>
          )}
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmReplace}
        titleId="admit-replace-title"
        title={t('admit.replaceTitle', { room: room ?? '' })}
        confirmLabel={t('admit.replaceConfirm')}
        cancelLabel={t('common.cancel')}
        closeLabel={t('common.close')}
        tone="danger"
        onCancel={() => setConfirmReplace(false)}
        onConfirm={() => {
          setConfirmReplace(false);
          admit(true);
        }}
      >
        <p>{t('admit.replaceBody', { room: room ?? '' })}</p>
      </ConfirmDialog>
    </>
  );
}

/**
 * Ventana de ingreso de paciente. Se abre desde la cabecera, el censo de la planta o la
 * ficha de una habitación libre. Cada apertura monta un formulario nuevo.
 */
export function AdmitDialog() {
  const admit = useOverlay((s) => s.admit);
  if (admit.session === 0) return null;
  return <AdmitForm key={admit.session} initialRoom={admit.room} open={admit.open} />;
}
