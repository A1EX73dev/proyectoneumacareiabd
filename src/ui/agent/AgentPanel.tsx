import { useMemo } from 'react';
import { LLM_AVAILABLE } from '../../core/runtime';
import { formatHHmm } from '../../core/time';
import { toToolDefinitions } from '../../core/tools';
import type { PlannerKind } from '../../core/types';
import { changePlanner } from '../actions';
import { Card } from '../common/Card';
import { toJson, URGENCY_BADGE } from '../format';
import { useApp, useT } from '../hooks';

const PLANNERS: PlannerKind[] = ['mock', 'llm'];

export function AgentPanel() {
  const { t, tk } = useT();
  const plannerKind = useApp((s) => s.agent.plannerKind);
  const lastEvent = useApp((s) => s.agent.lastEvent);
  const calls = useApp((s) => s.agent.calls);
  const notifications = useApp((s) => s.agent.notifications);
  const fallbacks = useApp((s) => s.agent.fallbacks);
  const toolDefs = useMemo(() => toJson(toToolDefinitions()), []);

  return (
    <Card title={t('agent.title')} titleId="agent-title">
      <div className="space-y-4">
        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-slate-900">
            {t('agent.planner')}
          </legend>
          <div className="flex flex-wrap gap-4">
            {PLANNERS.map((kind) => {
              const disabled = kind === 'llm' && !LLM_AVAILABLE;
              return (
                <label
                  key={kind}
                  className={`flex items-center gap-2 text-sm ${disabled ? 'text-slate-500' : 'text-slate-800'}`}
                >
                  <input
                    type="radio"
                    name="planner"
                    value={kind}
                    checked={plannerKind === kind}
                    disabled={disabled}
                    onChange={() => changePlanner(kind)}
                    className="accent-teal-600"
                  />
                  {tk('planner', kind)}
                  {disabled && (
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                      {t('agent.soon')}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-slate-600">
            {t('agent.plannerHint')} {fallbacks > 0 && t('agent.fallbacks', { n: fallbacks })}
          </p>
        </fieldset>

        <div>
          <h3 className="text-sm font-semibold text-slate-900">{t('agent.lastEvent')}</h3>
          {lastEvent ? (
            <div className="mt-1 rounded-md bg-slate-50 p-2 text-xs ring-1 ring-slate-200">
              <p>
                <span className="font-semibold">{tk('event', lastEvent.kind)}</span> ·{' '}
                <span className="font-mono">{formatHHmm(lastEvent.at)}</span>
              </p>
              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-slate-700">
                {toJson(lastEvent.payload)}
              </pre>
            </div>
          ) : (
            <p className="text-sm text-slate-600">{t('agent.noEvent')}</p>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            {t('agent.calls')} <span className="font-normal text-slate-600">({calls.length})</span>
          </h3>
          {calls.length === 0 ? (
            <p className="text-sm text-slate-600">{t('agent.noCalls')}</p>
          ) : (
            <ol className="mt-1 max-h-80 space-y-1 overflow-auto pr-1">
              {calls.slice(0, 40).map((rec) => (
                <li key={rec.id}>
                  <details className="rounded-md text-xs ring-1 ring-slate-200 open:bg-slate-50">
                    <summary className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-0.5 px-2 py-1.5">
                      <span className="font-mono tabular-nums text-slate-600">
                        {formatHHmm(rec.atMin)}
                      </span>
                      <span
                        className={rec.result.ok ? 'text-emerald-700' : 'text-red-700'}
                        aria-hidden="true"
                      >
                        {rec.result.ok ? '✓' : '✗'}
                      </span>
                      <span className="sr-only">
                        {rec.result.ok ? t('log.ok') : t('log.rejected')}
                      </span>
                      <code className="font-semibold text-slate-900">{rec.call.name}</code>
                      {rec.call.priority && (
                        <span className="text-slate-600">
                          P{rec.call.priority} · {tk('source', rec.call.source ?? 'agent')}
                        </span>
                      )}
                    </summary>
                    <div className="space-y-1 border-t border-slate-200 px-2 py-1.5">
                      {rec.call.reason && (
                        <p className="text-slate-700">
                          <span className="font-semibold">{t('log.reason')}:</span>{' '}
                          {rec.call.reason}
                        </p>
                      )}
                      <p className="font-semibold text-slate-800">{t('agent.args')}</p>
                      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-slate-700">
                        {toJson(rec.call.args)}
                      </pre>
                      <p className="font-semibold text-slate-800">{t('agent.result')}</p>
                      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-slate-700">
                        {toJson(rec.result)}
                      </pre>
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-900">{t('agent.notifications')}</h3>
          {notifications.length === 0 ? (
            <p className="text-sm text-slate-600">{t('agent.noNotifications')}</p>
          ) : (
            <ul className="mt-1 max-h-40 space-y-1 overflow-auto text-xs" aria-live="polite">
              {notifications.slice(0, 15).map((n) => (
                <li
                  key={n.id}
                  className="flex flex-wrap items-center gap-2 rounded-md px-2 py-1 ring-1 ring-slate-200"
                >
                  <span className="font-mono tabular-nums text-slate-600">
                    {formatHHmm(n.atMin)}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 font-semibold ${URGENCY_BADGE[n.urgency]}`}
                  >
                    {tk('urgency', n.urgency)}
                  </span>
                  {n.room && <span className="font-semibold">{n.room}</span>}
                  <span className="text-slate-800">{n.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <details className="text-xs">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">
            {t('agent.toolDefs')}
          </summary>
          <p className="mt-1 text-slate-600">{t('agent.toolDefsHint')}</p>
          <pre className="mt-1 max-h-72 overflow-auto rounded-md bg-slate-900 p-2 font-mono text-[11px] text-slate-100">
            {toolDefs}
          </pre>
        </details>
      </div>
    </Card>
  );
}
