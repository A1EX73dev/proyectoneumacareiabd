import { useT } from '../hooks';

/** Aviso fijo de privacidad, siempre visible. */
export function PrivacyNotice() {
  const { t } = useT();
  return (
    <aside
      aria-label={t('privacy.title')}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-700 bg-slate-900/95 px-4 py-2 text-center text-xs text-slate-100 backdrop-blur"
      style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <strong className="font-semibold text-teal-300">{t('privacy.title')}:</strong>{' '}
      {t('privacy.body')}
    </aside>
  );
}
