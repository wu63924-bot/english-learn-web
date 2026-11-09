import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { UpdateBanner } from './UpdateBanner';

const tabs = [
  { to: '/', label: '今日', icon: TodayIcon },
  { to: '/review', label: '复习', icon: ReviewIcon },
  { to: '/records', label: '记录', icon: RecordsIcon }
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="app-bar">
        <span className="app-brand">英语学习</span>
        <NavLink to="/settings" className={({ isActive }) => `settings-link${isActive ? ' active' : ''}`} aria-label="设置">
          <SettingsIcon />
        </NavLink>
      </header>
      <UpdateBanner />
      <main className="app-main">{children}</main>
      <nav className="tab-bar" aria-label="主导航">
        {tabs.map(tab => (
          <NavLink key={tab.to} to={tab.to} end={tab.to === '/'} className={({ isActive }) => `tab-item${isActive ? ' active' : ''}`}>
            <span className="tab-icon" aria-hidden="true"><tab.icon /></span>
            <span className="tab-label">{tab.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function iconProps() {
  return { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
}

function TodayIcon() {
  return <svg {...iconProps()}><circle cx="12" cy="12" r="3.6" /><path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7" /></svg>;
}

function ReviewIcon() {
  return <svg {...iconProps()}><path d="M4 9a8 8 0 0 1 13.7-4.4L20 7" /><path d="M20 4v3h-3" /><path d="M20 15a8 8 0 0 1-13.7 4.4L4 17" /><path d="M4 20v-3h3" /></svg>;
}

function RecordsIcon() {
  return <svg {...iconProps()}><path d="M5 5.5h14M5 12h14M5 18.5h9" /></svg>;
}

function SettingsIcon() {
  return <svg {...iconProps()}><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" /></svg>;
}
