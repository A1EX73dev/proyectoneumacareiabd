import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { newId } from '../core/ids';

/**
 * Estado efímero de la interfaz que no pertenece al dominio: la ventana de ingreso y los
 * avisos emergentes. Vive aparte del store de la planta para que `core/` siga sin saber
 * nada de ventanas.
 */

export interface Toast {
  id: string;
  tone: 'success' | 'error';
  title: string;
  detail?: string;
  /** Habitación relacionada: el aviso ofrece abrirla. */
  room?: string;
}

interface OverlayState {
  /** `session` cambia en cada apertura: el formulario empieza siempre de cero. */
  admit: { open: boolean; room: string | null; session: number };
  toasts: Toast[];
}

const MAX_TOASTS = 3;

export const overlayStore = createStore<OverlayState>()(() => ({
  admit: { open: false, room: null, session: 0 },
  toasts: [],
}));

export function useOverlay<T>(selector: (state: OverlayState) => T): T {
  return useStore(overlayStore, selector);
}

/** Abre el formulario de ingreso, opcionalmente con una habitación ya elegida. */
export function openAdmitDialog(room: string | null = null): void {
  overlayStore.setState((s) => ({ admit: { open: true, room, session: s.admit.session + 1 } }));
}

export function closeAdmitDialog(): void {
  overlayStore.setState((s) => ({ admit: { ...s.admit, open: false } }));
}

export function pushToast(toast: Omit<Toast, 'id'>): void {
  overlayStore.setState((s) => ({
    toasts: [...s.toasts, { ...toast, id: newId('toast') }].slice(-MAX_TOASTS),
  }));
}

export function dismissToast(id: string): void {
  overlayStore.setState((s) => ({ toasts: s.toasts.filter((toast) => toast.id !== id) }));
}
