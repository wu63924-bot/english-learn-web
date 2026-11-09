import { useEffect } from 'react';
import { addStudySeconds } from '../repositories/studyRepository';

const HEARTBEAT_MS = 30_000;
const MAX_FLUSH_SECONDS = 120;

/**
 * Counts time spent on the page while it is visible. Flushes every 30 seconds,
 * when the page is hidden, and on unmount, so closing the tab keeps the time.
 */
export function useStudyTimer(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    let last = Date.now();

    const flush = () => {
      const now = Date.now();
      const seconds = Math.round((now - last) / 1000);
      last = now;
      if (seconds >= 1) void addStudySeconds(Math.min(seconds, MAX_FLUSH_SECONDS));
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flush();
      } else {
        last = Date.now();
      }
    };

    const onPageHide = () => flush();

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') flush();
    }, HEARTBEAT_MS);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      flush();
    };
  }, [enabled]);
}
