import { useEffect } from 'react';
import { engine } from './core/runtime';
import { AgentPanel } from './ui/agent/AgentPanel';
import { TriggerAgenda } from './ui/agent/TriggerAgenda';
import { useApp, useT } from './ui/hooks';
import { Header } from './ui/layout/Header';
import { PrivacyNotice } from './ui/layout/PrivacyNotice';
import { FloorPlan } from './ui/map/FloorPlan';
import { RoomMenu } from './ui/room/RoomMenu';
import { RoomView } from './ui/room/RoomView';
import { VoicePanel } from './ui/voice/VoicePanel';

export default function App() {
  const { t, lang } = useT();
  const view = useApp((s) => s.ui.view);
  const selected = useApp((s) => s.ui.selectedRoom);
  const roomId = view === 'room' ? selected : null;

  useEffect(() => {
    engine.start();
    return () => engine.stop();
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t('app.title');
  }, [lang, t]);

  return (
    <div className="min-h-screen bg-slate-100 pb-24 text-slate-900">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-30 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-slate-900"
      >
        {t('a11y.skip')}
      </a>
      <Header />
      <main
        id="main"
        className="mx-auto grid max-w-[1600px] gap-4 p-3 md:p-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]"
      >
        <div className="flex min-w-0 flex-col gap-4">
          {roomId ? <RoomView roomId={roomId} /> : <FloorPlan />}
          <div className="grid gap-4 xl:grid-cols-2">
            <VoicePanel />
            <AgentPanel />
          </div>
          {roomId && <TriggerAgenda />}
        </div>
        <aside className="flex min-w-0 flex-col gap-4" aria-label={t('a11y.sidePanel')}>
          {roomId ? <RoomMenu roomId={roomId} /> : <TriggerAgenda />}
        </aside>
      </main>
      <PrivacyNotice />
    </div>
  );
}
