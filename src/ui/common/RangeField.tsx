import { useEffect, useRef, useState } from 'react';

interface RangeFieldProps {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Valor objetivo (lo que se ha pedido). */
  value: number;
  /** Valor actual (durante la rampa puede diferir del objetivo). */
  current?: number;
  currentLabel?: string;
  format: (v: number) => string;
  disabled?: boolean;
  hint?: string;
  onCommit: (value: number) => void;
}

/**
 * Slider accesible. Mientras se arrastra solo cambia el borrador local; el valor se envía
 * (una única llamada a la función del agente) cuando el usuario deja de moverlo.
 */
export function RangeField({
  id,
  label,
  min,
  max,
  step,
  value,
  current,
  currentLabel,
  format,
  disabled,
  hint,
  onCommit,
}: RangeFieldProps) {
  const [draft, setDraft] = useState<number | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const shown = draft ?? value;

  function handleChange(next: number) {
    setDraft(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      onCommit(next);
      setDraft(null);
    }, 350);
  }

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-slate-800">
          {label}
        </label>
        <output htmlFor={id} className="font-mono text-sm tabular-nums text-slate-900">
          {format(shown)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        disabled={disabled}
        aria-valuetext={format(shown)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => handleChange(Number(e.target.value))}
        className="w-full accent-teal-600 disabled:opacity-50"
      />
      <div className="flex justify-between text-xs text-slate-600">
        <span>
          {format(min)} – {format(max)}
        </span>
        {current !== undefined && (
          <span className="tabular-nums">
            {currentLabel}: {format(current)}
          </span>
        )}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-amber-800">
          {hint}
        </p>
      )}
    </div>
  );
}
