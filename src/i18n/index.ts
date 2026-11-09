import { es, type MessageKey, type Messages } from './es';
import { ca } from './ca';
import { en } from './en';

export type Lang = 'es' | 'ca' | 'en';
export const LANGS: Lang[] = ['es', 'ca', 'en'];
export type { MessageKey, Messages };
export type Params = Record<string, string | number>;

export const DICTIONARIES: Record<Lang, Messages> = { es, ca, en };

/** Voz para speechSynthesis según el idioma de la interfaz. */
export const SPEECH_LANG: Record<Lang, string> = { es: 'es-ES', ca: 'ca-ES', en: 'en-GB' };

let current: Lang = 'es';

export function setLang(lang: Lang): void {
  current = lang;
}

export function getLang(): Lang {
  return current;
}

/** Traduce una clave (con parámetros `{nombre}`). Si falta, cae al castellano y después a la clave. */
export function translate(lang: Lang, key: MessageKey | string, params?: Params): string {
  const dict = DICTIONARIES[lang] as Record<string, string>;
  const fallback = DICTIONARIES.es as Record<string, string>;
  const template = dict[key] ?? fallback[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Traducción con el idioma activo. */
export function t(key: MessageKey, params?: Params): string {
  return translate(current, key, params);
}

/** Traducción de claves compuestas `prefijo.id` (protocolos, tipos de disparador, funciones…). */
export function tk(prefix: string, id: string, params?: Params): string {
  return translate(current, `${prefix}.${id}`, params);
}
