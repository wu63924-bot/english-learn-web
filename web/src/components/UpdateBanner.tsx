import { useRegisterSW } from 'virtual:pwa-register/react';

export function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="update-banner" role="status">
      <span>有新版本可用</span>
      <button type="button" onClick={() => { void updateServiceWorker(true); }}>更新并重载</button>
    </div>
  );
}
