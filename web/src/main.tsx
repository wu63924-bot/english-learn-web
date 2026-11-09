import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { ErrorState, LoadingState } from './components/UI';
import { initializeDatabase } from './db/seed';
import { processPendingGrades } from './services/aiQueue';
import { unifyKnowledge } from './services/knowledgeMigration';
import { TodayPage } from './pages/TodayPage';
import { ReviewPage } from './pages/ReviewPage';
import { RecordsPage } from './pages/RecordsPage';
import { SettingsPage } from './pages/SettingsPage';
import { CoursePage } from './pages/CoursePage';
import { ModulePage } from './pages/ModulePage';
import './styles.css';

function App() {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    void initializeDatabase()
      .then(async () => {
        await unifyKnowledge().catch(reason => console.warn('knowledge migration skipped', reason));
        setState('ready');
        void processPendingGrades();
      })
      .catch(reason => {
        setMessage(reason instanceof Error ? reason.message : '未知错误');
        setState('error');
      });
  }, []);

  useEffect(() => {
    const onOnline = () => {
      void processPendingGrades();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  if (state === 'loading') return <div className="app-shell"><LoadingState /></div>;
  if (state === 'error') return <div className="app-shell"><ErrorState message={`无法打开本地数据库：${message}`} /></div>;

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AppShell>
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/records" element={<RecordsPage />} />
          <Route path="/course/:courseId" element={<CoursePage />} />
          <Route path="/course/:courseId/module/:kind" element={<ModulePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
