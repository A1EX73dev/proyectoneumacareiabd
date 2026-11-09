import { useEffect, useRef, useState } from 'react';
import type { Soundscape } from '../../core/types';

interface AudioGraph {
  ctx: AudioContext;
  source: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
}

interface Voice {
  type: BiquadFilterType;
  freq: number;
  q: number;
  lfoHz: number;
  lfoDepth: number;
}

/** Aproximaciones sintéticas (ruido filtrado): es audio simulado, no grabaciones. */
const VOICES: Record<Exclude<Soundscape, 'silencio'>, Voice> = {
  lluvia: { type: 'bandpass', freq: 1400, q: 0.5, lfoHz: 0.3, lfoDepth: 0.15 },
  bosque: { type: 'bandpass', freq: 2600, q: 1.2, lfoHz: 0.15, lfoDepth: 0.35 },
  olas: { type: 'lowpass', freq: 500, q: 0.7, lfoHz: 0.12, lfoDepth: 0.8 },
  pajaros: { type: 'bandpass', freq: 4200, q: 9, lfoHz: 5, lfoDepth: 0.6 },
  respiracion: { type: 'lowpass', freq: 750, q: 0.7, lfoHz: 0.1, lfoDepth: 0.9 },
  ruido_blanco: { type: 'lowpass', freq: 9000, q: 0.5, lfoHz: 0.05, lfoDepth: 0 },
};

type AudioCtor = typeof AudioContext;

function getAudioCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Paisaje sonoro generado con WebAudio. Solo se crea tras un clic del usuario
 * (`enabled`), nunca graba ni usa el micrófono.
 */
export function useSoundscapeAudio(enabled: boolean, soundscape: Soundscape, pct: number) {
  const graph = useRef<AudioGraph | null>(null);
  const [error, setError] = useState(false);
  const supported = getAudioCtor() !== null;

  useEffect(() => {
    if (!enabled) return;
    const Ctor = getAudioCtor();
    if (!Ctor) return;
    try {
      const ctx = new Ctor();
      const length = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start();
      lfo.start();
      void ctx.resume();
      graph.current = { ctx, source, filter, gain, lfo, lfoGain };
      setError(false);
    } catch {
      setError(true);
    }
    return () => {
      const g = graph.current;
      graph.current = null;
      if (!g) return;
      try {
        g.source.stop();
        g.lfo.stop();
        void g.ctx.close();
      } catch {
        /* el contexto ya estaba cerrado */
      }
    };
  }, [enabled]);

  useEffect(() => {
    const g = graph.current;
    if (!g || !enabled) return;
    try {
      const now = g.ctx.currentTime;
      if (soundscape === 'silencio' || pct <= 0) {
        g.gain.gain.setTargetAtTime(0, now, 0.3);
        g.lfoGain.gain.setTargetAtTime(0, now, 0.3);
        return;
      }
      const voice = VOICES[soundscape];
      const level = (pct / 100) * 0.22;
      g.filter.type = voice.type;
      g.filter.frequency.setTargetAtTime(voice.freq, now, 0.3);
      g.filter.Q.setTargetAtTime(voice.q, now, 0.3);
      g.lfo.frequency.setTargetAtTime(voice.lfoHz, now, 0.3);
      g.gain.gain.setTargetAtTime(level * (1 - voice.lfoDepth / 2), now, 0.5);
      g.lfoGain.gain.setTargetAtTime((level * voice.lfoDepth) / 2, now, 0.5);
    } catch {
      setError(true);
    }
  }, [enabled, soundscape, pct]);

  return { supported, error };
}
