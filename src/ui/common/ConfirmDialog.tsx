import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  titleId: string;
  title: string;
  confirmLabel: string;
  cancelLabel: string;
  closeLabel: string;
  /** `danger` cuando confirmar borra o sustituye algo. */
  tone?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
}

/**
 * Ventana de confirmación. El foco empieza en «Cancelar»: pulsar Intro sin leer nunca
 * ejecuta la acción.
 */
export function ConfirmDialog({
  open,
  titleId,
  title,
  confirmLabel,
  cancelLabel,
  closeLabel,
  tone = 'primary',
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const danger = tone === 'danger';
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      titleId={titleId}
      size="sm"
      role="alertdialog"
      closeLabel={closeLabel}
      icon={
        <span
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            danger ? 'bg-red-100 text-red-700' : 'bg-teal-100 text-teal-700'
          }`}
        >
          <Icon name={danger ? 'alert' : 'info'} className="h-5 w-5" />
        </span>
      }
      footer={
        <>
          <button type="button" data-autofocus onClick={onCancel} className="btn btn-secondary">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-700">{children}</div>
    </Modal>
  );
}
