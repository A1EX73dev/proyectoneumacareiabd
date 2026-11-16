import { useEffect } from 'react';
import { engine } from './core/runtime';
import { AgentPanel } from './ui/agent/AgentPanel';
import { StaffAlerts } from './ui/agent/StaffAlerts';
import { TriggerAgenda } from './ui/agent/TriggerAgenda';
import { checkLlmBackend } from './ui/actions';
import { Toaster } from './ui/common/Toaster';
import { useApp, useT } from './ui/hooks';
import { Header } from './ui/layout/Header';
import { PrivacyNotice } from './ui/layout/PrivacyNotice';
import { FloorPlan } from './ui/map/FloorPlan';
import { WardCensus } from './ui/map/WardCensus';
import { WardStats } from './ui/map/WardStats';
import { AdmitDialog } from './ui/patient/AdmitDialog';
import { RoomMenu } from './ui/room/RoomMenu';
import { RoomView } from './ui/room/RoomView';
import { UserPanel } from './ui/patient/UserPanel';
import { useRoute } from './ui/route';
import { VoicePanel } from './ui/voice/VoicePanel';

export default function App() {
  const { t, lang } = useT();
  const view = useApp((s) => s.ui.view);
  const selected = useApp((s) => s.ui.selectedRoom);
  const roomId = view === 'room' ? selected : null;
  const route = useRoute();

  useEffect(() => {
    engine.start();
    void checkLlmBackend();
    return () => engine.stop();
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = route.mode === 'user' ? t('user.title') : t('app.title');
  }, [lang, t, route.mode]);

  if (route.mode === 'user') {
    return (
      <>
        <UserPanel roomId={route.room} />
        <Toaster />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-24 text-slate-900">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-slate-900 focus:shadow-lg"
      >
        {t('a11y.skip')}
      </a>
      <Header />
      <main
        id="main"
        className="mx-auto grid max-w-[1600px] gap-5 p-4 md:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]"
      >
        <div className="flex min-w-0 flex-col gap-5">
          {roomId ? (
            <RoomView roomId={roomId} />
          ) : (
            <>
              <WardStats />
              <FloorPlan />
              <WardCensus />
            </>
          )}
          <div className="grid gap-5 xl:grid-cols-2">
            <VoicePanel />
            {route.mode === 'hospital' ? <StaffAlerts /> : <AgentPanel />}
          </div>
          {roomId && <TriggerAgenda />}
        </div>
        <aside className="flex min-w-0 flex-col gap-5" aria-label={t('a11y.sidePanel')}>
          {roomId ? <RoomMenu roomId={roomId} /> : <TriggerAgenda />}
        </aside>
      </main>
      <PrivacyNotice />
      <AdmitDialog />
      <Toaster />
    </div>
  );
}
