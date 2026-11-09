import { formatHHmm } from '../../core/time';
import type { LogEntry } from '../../core/types';
import { useT } from '../hooks';

const PRIORITY_STYLE: Record<number, string> = {
  1: 'bg-red-100 text-red-900',
  2: 'bg-orange-100 text-orange-900',
  3: 'bg-amber-100 text-amber-900',
  4: 'bg-indigo-100 text-indigo-900',
  5: 'bg-emerald-100 text-emerald-900',
  6: 'bg-slate-100 text-slate-800',
};

/** Registro de decisiones: hora, acción, motivo y prioridad (el más reciente primero). */
export function DecisionLog({ entries }: { entries: LogEntry[] }) {
  const { t, tk } = useT();
  if (entries.length === 0) return <p className="text-sm text-slate-600">{t('log.empty')}</p>;
  return (
    <div className="max-h-[28rem] overflow-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[30rem] border-collapse text-left text-xs">
        <caption className="sr-only">{t('log.title')}</caption>
        <thead className="sticky top-0 bg-slate-100 text-slate-700">
          <tr>
            <th scope="col" className="px-2 py-1.5 font-semibold">
              {t('log.time')}
            </th>
            <th scope="col" className="px-2 py-1.5 font-semibold">
              {t('log.action')}
            </th>
            <th scope="col" className="px-2 py-1.5 font-semibold">
              {t('log.reason')}
            </th>
            <th scope="col" className="px-2 py-1.5 font-semibold">
              {t('log.priority')}
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-t border-slate-200 align-top">
              <td className="whitespace-nowrap px-2 py-1.5 font-mono tabular-nums">
                {formatHHmm(e.atMin)}
              </td>
              <td className="px-2 py-1.5">
                <span aria-hidden="true">{e.ok ? '✓ ' : '⛔ '}</span>
                <span className="sr-only">{e.ok ? t('log.ok') : t('log.rejected')}</span>
                {e.action}
                {e.detail && <span className="block text-red-800">{e.detail}</span>}
              </td>
              <td className="px-2 py-1.5 text-slate-700">
                {e.reason}
                <span className="block text-slate-500">{tk('source', e.source)}</span>
              </td>
              <td className="px-2 py-1.5">
                <span
                  className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 font-medium ${PRIORITY_STYLE[e.priority] ?? ''}`}
                >
                  {e.priority} · {tk('priority', String(e.priority))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
