import { useEffect, useRef, type MouseEvent, type ReactNode, type SyntheticEvent } from 'react';
import { Icon } from './Icon';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  titleId: string;
  description?: string;
  /** Icono o distintivo a la izquierda del título. */
  icon?: ReactNode;
  size?: 'sm' | 'lg';
  /** `alertdialog` para las confirmaciones que interrumpen lo que se estaba haciendo. */
  role?: 'dialog' | 'alertdialog';
  closeLabel: string;
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Ventana modal sobre el elemento nativo `<dialog>`: el navegador se encarga de atrapar el
 * foco, de dejar inerte el resto de la página, de cerrar con Escape y de devolver el foco al
 * control que la abrió. Para que al abrirse el foco vaya a un control concreto, márcalo con
 * `data-autofocus`.
 */
export function Modal({
  open,
  onClose,
  title,
  titleId,
  description,
  icon,
  size = 'lg',
  role = 'dialog',
  closeLabel,
  footer,
  children,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Si el componente desaparece con la ventana abierta, no debe quedar la página bloqueada.
  useEffect(() => {
    const dialog = ref.current;
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  function onCancel(e: SyntheticEvent<HTMLDialogElement>) {
    // Escape: el cierre lo decide el estado de la aplicación, no el navegador.
    e.preventDefault();
    onClose();
  }

  // Clic en el fondo. Solo cuenta si empezó y terminó fuera: arrastrar una selección de texto
  // hasta el fondo no debe cerrar la ventana.
  function onMouseDown(e: MouseEvent<HTMLDialogElement>) {
    pressedOnBackdrop.current = e.target === ref.current;
  }
  function onClick(e: MouseEvent<HTMLDialogElement>) {
    if (pressedOnBackdrop.current && e.target === ref.current) onClose();
    pressedOnBackdrop.current = false;
  }

  return (
    <dialog
      ref={ref}
      role={role}
      aria-labelledby={titleId}
      aria-describedby={description ? `${titleId}-desc` : undefined}
      onCancel={onCancel}
      onMouseDown={onMouseDown}
      onClick={onClick}
      className={`m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] overflow-visible rounded-2xl bg-transparent p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60 open:animate-pop-in ${
        size === 'sm' ? 'max-w-md' : 'max-w-3xl'
      }`}
    >
      {open && (
        <div className="flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-2xl bg-white">
          <header className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
            {icon}
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-lg font-semibold leading-6 text-slate-900">
                {title}
              </h2>
              {description && (
                <p id={`${titleId}-desc`} className="mt-1 text-sm text-slate-600">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="btn btn-ghost -mr-2 -mt-1 px-2"
            >
              <Icon name="x" className="h-5 w-5" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  );
}
