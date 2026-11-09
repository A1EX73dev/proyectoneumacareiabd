import { useMemo } from 'react';
import { useStore } from 'zustand';
import { appStore, type AppState } from '../core/state';
import { translate, type Lang, type MessageKey, type Params } from '../i18n';

/** Suscripción a una porción del store (devuelve referencias estables del estado). */
export function useApp<T>(selector: (state: AppState) => T): T {
  return useStore(appStore, selector);
}

export interface Translator {
  lang: Lang;
  t: (key: MessageKey, params?: Params) => string;
  tk: (prefix: string, id: string, params?: Params) => string;
}

/** Traductor ligado al idioma activo: los componentes se re-renderizan al cambiarlo. */
export function useT(): Translator {
  const lang = useApp((s) => s.ui.lang);
  return useMemo(
    () => ({
      lang,
      t: (key, params) => translate(lang, key, params),
      tk: (prefix, id, params) => translate(lang, `${prefix}.${id}`, params),
    }),
    [lang],
  );
}
