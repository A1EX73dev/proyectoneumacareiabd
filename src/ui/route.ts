import { useSyncExternalStore } from 'react';

/**
 * Enrutado mínimo por «hash» (sin dependencias):
 *  - `#/` (o vacío)      → panel de administración (planta completa)
 *  - `#/paciente`        → panel de usuario: el paciente elige su habitación
 *  - `#/paciente/207`    → panel de usuario de la habitación 207
 */
export type Route =
  { mode: 'admin' } | { mode: 'hospital' } | { mode: 'user'; room: string | null };

export function parseHash(hash: string): Route {
  if (/^#\/hospital\/?$/.test(hash)) return { mode: 'hospital' };
  const m = /^#\/paciente(?:\/(20[1-9]|210))?\/?$/.exec(hash);
  return m ? { mode: 'user', room: m[1] ?? null } : { mode: 'admin' };
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

const snapshot = (): string => window.location.hash;

/** Ruta actual (se re-renderiza al cambiar el hash). */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, snapshot, () => '');
  return parseHash(hash);
}

export function goUser(room?: string | null): void {
  window.location.hash = room ? `#/paciente/${room}` : '#/paciente';
}

/** Versión del panel de administración para el hospital: sin registros ni historial. */
export function goHospital(): void {
  window.location.hash = '#/hospital';
}

/** ¿Está activa la vista hospital? (oculta registros, historial y detalles del agente). */
export function useHospitalMode(): boolean {
  return useRoute().mode === 'hospital';
}

export function goAdmin(): void {
  window.location.hash = '#/';
}
