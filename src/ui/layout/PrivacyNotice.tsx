import { Icon } from '../common/Icon';
import { useT } from '../hooks';

/** Aviso fijo de privacidad, siempre visible. */
export function PrivacyNotice() {
  const { t } = useT();
  return (
    <aside
      aria-label={t('privacy.title')}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-2 text-xs text-slate-600 backdrop-blur"
      style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <p className="mx-auto flex max-w-[1600px] items-center justify-center gap-2 text-center">
        <Icon name="shield" className="hidden h-4 w-4 text-teal-700 sm:block" />
        <span>
          <strong className="font-semibold text-slate-900">{t('privacy.title')}:</strong>{' '}
          {t('privacy.body')}
        </span>
      </p>
    </aside>
  );
}
