import { useCallback, useEffect, useRef, useState } from 'react';

/* Tipos mínimos de la Web Speech API (no están en lib.dom de TypeScript). */
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<RecognitionAlternative>>;
}
interface RecognitionErrorEvent {
  error: string;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type VoiceStatus = 'idle' | 'listening' | 'unsupported' | 'denied' | 'error';

/**
 * Reconocimiento de voz (es-ES) y síntesis de respuesta. Solo se activa con un clic,
 * no graba ni envía audio a ningún servicio propio: el texto reconocido va al intérprete local.
 * Nota: algunos navegadores usan un servicio en la nube del propio navegador para reconocer.
 */
export function useVoice(onResult: (text: string) => void, recognitionLang = 'es-ES') {
  const supported = getRecognitionCtor() !== null;
  const [status, setStatus] = useState<VoiceStatus>(supported ? 'idle' : 'unsupported');
  const recognition = useRef<Recognition | null>(null);
  const onResultRef = useRef(onResult);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const start = useCallback(() => {
    try {
      const Ctor = getRecognitionCtor();
      if (!Ctor) {
        setStatus('unsupported');
        return;
      }
      recognition.current?.abort();
      const rec = new Ctor();
      rec.lang = recognitionLang;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.continuous = false;
      rec.onresult = (e) => {
        const text = e.results[0]?.[0]?.transcript?.trim();
        if (text) onResultRef.current(text);
      };
      rec.onerror = (e) => {
        setStatus(
          e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : 'error',
        );
      };
      rec.onend = () => {
        setStatus((s) => (s === 'listening' ? 'idle' : s));
        recognition.current = null;
      };
      rec.start();
      recognition.current = rec;
      setStatus('listening');
    } catch {
      setStatus('error');
    }
  }, [recognitionLang]);

  const stop = useCallback(() => {
    try {
      recognition.current?.stop();
    } catch {
      /* ya estaba detenido */
    }
    setStatus((s) => (s === 'listening' ? 'idle' : s));
  }, []);

  const speak = useCallback((text: string, lang: string) => {
    try {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch {
      /* la síntesis es opcional */
    }
  }, []);

  useEffect(
    () => () => {
      try {
        recognition.current?.abort();
        if (typeof window !== 'undefined' && 'speechSynthesis' in window)
          window.speechSynthesis.cancel();
      } catch {
        /* nada que limpiar */
      }
    },
    [],
  );

  return { supported, status, start, stop, speak };
}
