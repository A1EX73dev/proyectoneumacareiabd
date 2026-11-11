import { bedGoal, bedLimits } from '../../core/policy/bed';
import { openRoomView } from '../actions';
import { CategoryBadge, ProtocolBadge } from '../common/Badges';
import { Card } from '../common/Card';
import { Icon } from '../common/Icon';
import { fmtDeg, fmtTemp } from '../format';
import { useApp, useT } from '../hooks';
import { openAdmitDialog } from '../overlay';

/** Censo de la planta: una fila por habitación con el paciente y el estado de la sala. */
export function WardCensus() {
  const { t } = useT();
  const rooms = useApp((s) => s.rooms);
  const ids = useApp((s) => s.roomIds);

  return (
    <Card title={t('census.title')} titleId="census-title" icon="list" flush>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-5 py-2.5 font-medium">
                {t('census.room')}
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                {t('census.patient')}
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                {t('census.category')}
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                {t('census.protocol')}
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                {t('room.temp')}
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                {t('census.bed')}
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                {t('census.mode')}
              </th>
              <th scope="col" className="px-5 py-2.5">
                <span className="sr-only">{t('agenda.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ids.map((id) => {
              const room = rooms[id];
              if (!room) return null;
              const form = room.patientForm;
              const name = form?.name.trim();
              const limited = bedLimits(form).restricted;
              return (
                <tr key={id} className="hover:bg-slate-50/70">
                  <th scope="row" className="px-5 py-2.5 font-semibold tabular-nums text-slate-900">
                    {id}
                  </th>
                  {room.occupied ? (
                    <>
                      <td className="max-w-[12rem] px-3 py-2.5">
                        <span
                          className={`block truncate ${name ? 'text-slate-900' : 'text-slate-500'}`}
                        >
                          {name || t('patient.anonymous')}
                        </span>
                        {form && (
                          <span className="block text-xs text-slate-500">
                            {t('patient.years', { age: form.age })}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {room.category ? (
                          <CategoryBadge category={room.category} />
                        ) : (
                          <span className="text-xs text-slate-500">{t('category.none')}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <ProtocolBadge protocol={room.protocol} />
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                        {fmtTemp(room.values.tempC)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                        <span className="inline-flex items-center gap-1">
                          {limited && <Icon name="lock" className="h-3.5 w-3.5 text-amber-700" />}
                          {fmtDeg(bedGoal(room.bed))}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                            room.auto ? 'text-teal-800' : 'text-orange-800'
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`h-1.5 w-1.5 rounded-full ${room.auto ? 'bg-teal-600' : 'bg-orange-500'}`}
                          />
                          {room.auto ? t('map.aiOn') : t('map.aiOff')}
                        </span>
                      </td>
                    </>
                  ) : (
                    <td colSpan={6} className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                        <span
                          aria-hidden="true"
                          className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                        />
                        {t('census.free')}
                      </span>
                    </td>
                  )}
                  <td className="whitespace-nowrap px-5 py-2 text-right">
                    {!room.occupied && (
                      <button
                        type="button"
                        onClick={() => openAdmitDialog(id)}
                        className="btn btn-secondary btn-sm mr-1.5"
                      >
                        <Icon name="userPlus" className="h-3.5 w-3.5" />
                        {t('census.admitHere')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openRoomView(id)}
                      aria-label={t('census.openAria', { room: id })}
                      className="btn btn-ghost btn-sm"
                    >
                      {t('common.open')}
                      <Icon name="arrowLeft" className="h-3.5 w-3.5 rotate-180" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
