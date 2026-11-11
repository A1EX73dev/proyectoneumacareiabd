import { isOverrideActive } from '../../core/policy/priorities';
import { Icon, type IconName } from '../common/Icon';
import { useApp, useT } from '../hooks';

interface StatProps {
  icon: IconName;
  label: string;
  value: string;
  hint: string;
  tone: string;
}

function Stat({ icon, label, value, hint, tone }: StatProps) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <dt className="truncate text-xs font-medium text-slate-500">{label}</dt>
        <dd className="flex items-baseline gap-1.5">
          <span className="text-xl font-semibold tabular-nums text-slate-900">{value}</span>
          <span className="truncate text-xs text-slate-500">{hint}</span>
        </dd>
      </div>
    </div>
  );
}

/** Indicadores de la planta: ocupación, salas en Modo IA, eventos activos y avisos. */
export function WardStats() {
  const { t } = useT();
  const rooms = useApp((s) => s.rooms);
  const ids = useApp((s) => s.roomIds);
  const nowMin = useApp((s) => s.clock.nowMin);
  const alerts = useApp((s) => s.agent.notifications.length);

  const list = ids.map((id) => rooms[id]).filter((r) => r !== undefined);
  const occupied = list.filter((r) => r.occupied);
  const auto = occupied.filter((r) => r.auto).length;
  const events = list.filter((r) => isOverrideActive(r.override, nowMin)).length;

  return (
    <dl aria-label={t('stats.label')} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Stat
        icon="bed"
        label={t('stats.occupancy')}
        value={String(occupied.length)}
        hint={t('stats.ofTotal', { total: list.length })}
        tone="bg-teal-50 text-teal-700"
      />
      <Stat
        icon="sparkles"
        label={t('stats.aiRooms')}
        value={String(auto)}
        hint={t('stats.aiHint')}
        tone="bg-indigo-50 text-indigo-700"
      />
      <Stat
        icon="pulse"
        label={t('stats.events')}
        value={String(events)}
        hint={t('stats.eventsHint')}
        tone="bg-amber-50 text-amber-700"
      />
      <Stat
        icon="bell"
        label={t('stats.alerts')}
        value={String(alerts)}
        hint={t('stats.alertsHint')}
        tone="bg-rose-50 text-rose-700"
      />
    </dl>
  );
}
