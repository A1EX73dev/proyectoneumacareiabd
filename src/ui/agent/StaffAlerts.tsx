import { formatHHmm } from '../../core/time';
import { Card } from '../common/Card';
import { URGENCY_BADGE } from '../format';
import { useApp, useT } from '../hooks';

/** Avisos a enfermería (versión hospital: sin llamadas a funciones, eventos ni esquemas). */
export function StaffAlerts() {
  const { t, tk } = useT();
  const notifications = useApp((s) => s.agent.notifications);

  return (
    <Card title={t('agent.notifications')} titleId="alerts-title" icon="bell">
      {notifications.length === 0 ? (
        <p className="text-sm text-slate-600">{t('agent.noNotifications')}</p>
      ) : (
        <ul className="max-h-72 space-y-1.5 overflow-auto text-sm" aria-live="polite">
          {notifications.slice(0, 15).map((n) => (
            <li
              key={n.id}
              className="flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 ring-1 ring-slate-200"
            >
              <span className="font-mono tabular-nums text-slate-600">{formatHHmm(n.atMin)}</span>
              <span className={`rounded px-1.5 py-0.5 font-semibold ${URGENCY_BADGE[n.urgency]}`}>
                {tk('urgency', n.urgency)}
              </span>
              {n.room && <span className="font-semibold">{n.room}</span>}
              <span className="text-slate-800">{n.message}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
