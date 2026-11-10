import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { formatHHmm } from '../../core/time';
import { SPEECH_LANG } from '../../i18n';
import { sendUtterance } from '../actions';
import { Card } from '../common/Card';
import { Switch } from '../common/Switch';
import { useApp, useT } from '../hooks';
import { useVoice } from './useVoice';

const EXAMPLES = [
  'abre la habitación 205',
  'sube la temperatura a veintitrés',
  'baja la luz al 20 por ciento',
  'luz más cálida',
  'pon el protocolo de noche',
  'pon sonido de lluvia',
  'desactiva el aroma',
  'activa el modo IA',
  'programa la medicación a las 14:00 en la 202',
  'avisa a enfermería',
  'qué estado tiene la 203',
];

/** Peticiones abiertas que solo entiende el agente de IA. */
const LLM_EXAMPLES = [
  'la 203 no consigue dormir, ayúdale',
  'prepara la 205 para una cura de 20 minutos',
  'pon todas las habitaciones ocupadas en modo noche',
  'hace calor en la 201, bájala un par de grados y pon algo relajante',
];

export function VoicePanel() {
  const { t, lang } = useT();
  const conversation = useApp((s) => s.agent.conversation);
  const speech = useApp((s) => s.agent.speech);
  const isLlm = useApp((s) => s.agent.plannerKind === 'llm');
  const thinking = useApp((s) => s.agent.pending > 0);
  const llmError = useApp((s) => s.agent.llmError);
  const listRef = useRef<HTMLOListElement>(null);
  const [text, setText] = useState('');
  const [voiceOut, setVoiceOut] = useState(false);
  const lastSpoken = useRef<string | null>(speech[speech.length - 1]?.id ?? null);

  const onRecognized = useCallback((recognized: string) => {
    void sendUtterance(recognized);
  }, []);
  // El agente de IA entiende el idioma de la interfaz; el motor local, solo castellano.
  const voice = useVoice(onRecognized, isLlm ? SPEECH_LANG[lang] : 'es-ES');
  const { speak } = voice;

  // Lee en voz alta las nuevas respuestas del agente (solo si el usuario lo ha activado).
  useEffect(() => {
    const last = speech[speech.length - 1];
    if (!last || last.id === lastSpoken.current) return;
    lastSpoken.current = last.id;
    if (voiceOut) speak(last.text, SPEECH_LANG[lang]);
  }, [speech, voiceOut, lang, speak]);

  // La respuesta del agente de IA llega con retraso: la conversación sigue al último mensaje.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [conversation, thinking]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    void sendUtterance(value);
    setText('');
  }

  function onMic() {
    if (voice.status === 'listening') {
      voice.stop();
      return;
    }
    setVoiceOut(true);
    voice.start();
  }

  const statusText =
    voice.status === 'unsupported'
      ? t('voice.unsupported')
      : voice.status === 'denied'
        ? t('voice.denied')
        : voice.status === 'error'
          ? t('voice.error')
          : voice.status === 'listening'
            ? t('voice.listening')
            : t(isLlm ? 'voice.idleLlm' : 'voice.idle');
  const examples = isLlm ? [...LLM_EXAMPLES, ...EXAMPLES] : EXAMPLES;

  return (
    <Card title={t('voice.title')} titleId="voice-title">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onMic}
            disabled={!voice.supported}
            aria-pressed={voice.status === 'listening'}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:bg-slate-400 ${
              voice.status === 'listening'
                ? 'animate-pulse bg-red-700'
                : 'bg-teal-700 hover:bg-teal-800'
            }`}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" />
            </svg>
            {voice.status === 'listening' ? t('voice.stop') : t('voice.speak')}
          </button>
          <p role="status" className="text-sm text-slate-700">
            {statusText}
          </p>
          <span
            className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              isLlm ? 'bg-teal-100 text-teal-900' : 'bg-slate-200 text-slate-700'
            }`}
          >
            {t(isLlm ? 'voice.brainLlm' : 'voice.brainMock')}
          </span>
        </div>

        {isLlm && llmError && (
          <p
            role="alert"
            className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 ring-1 ring-amber-200"
          >
            {t('voice.llmUnavailable', { error: llmError })}
          </p>
        )}

        <Switch
          id="voice-out"
          checked={voiceOut}
          label={t('voice.readAloud')}
          description={t('voice.readAloudHint')}
          onChange={setVoiceOut}
        />

        <form onSubmit={onSubmit} className="flex gap-2">
          <label htmlFor="voice-text" className="sr-only">
            {t('voice.textLabel')}
          </label>
          <input
            id="voice-text"
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('voice.placeholder')}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
          />
          <button
            type="submit"
            className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-800"
          >
            {t('voice.send')}
          </button>
        </form>

        <details className="text-xs">
          <summary className="cursor-pointer font-medium text-slate-800">
            {t('voice.examples')}
          </summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {examples.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => void sendUtterance(ex)}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-800 ring-1 ring-slate-300 hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
              >
                «{ex}»
              </button>
            ))}
          </div>
          <p className="mt-2 text-slate-600">
            {t(isLlm ? 'voice.examplesNoteLlm' : 'voice.examplesNote')}
          </p>
        </details>

        <ol
          ref={listRef}
          aria-live="polite"
          aria-label={t('voice.conversation')}
          className="max-h-56 space-y-1.5 overflow-auto rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200"
        >
          {conversation.length === 0 && !thinking && (
            <li className="text-sm text-slate-600">{t('voice.empty')}</li>
          )}
          {conversation.slice(-14).map((item) => (
            <li
              key={item.id}
              className={`flex ${item.who === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <span
                className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-sm ${
                  item.who === 'user'
                    ? 'bg-teal-700 text-white'
                    : 'bg-white text-slate-900 ring-1 ring-slate-200'
                }`}
              >
                <span className="sr-only">
                  {item.who === 'user' ? t('voice.you') : t('voice.agent')}:{' '}
                </span>
                {item.text}
                <span
                  className={`ml-2 text-[10px] ${item.who === 'user' ? 'text-teal-100' : 'text-slate-500'}`}
                >
                  {formatHHmm(item.atMin)}
                </span>
              </span>
            </li>
          ))}
          {thinking && (
            <li className="flex justify-start">
              <span className="animate-pulse rounded-lg bg-white px-2.5 py-1.5 text-sm italic text-slate-600 ring-1 ring-slate-200">
                {t('voice.thinking')}
              </span>
            </li>
          )}
        </ol>
      </div>
    </Card>
  );
}
