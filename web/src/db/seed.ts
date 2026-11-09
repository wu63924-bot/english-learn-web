import { db } from './db';
import type { AppSettings } from '../types/domain';

export const defaultSettings: AppSettings = {
  id: 'app',
  appVersion: '0.1.0',
  updatedAt: 0
};

/**
 * Opens the database and writes defaults only when missing.
 * Safe to call on every boot; never overwrites existing user data.
 */
export async function initializeDatabase(): Promise<void> {
  await db.open();
  await db.transaction('rw', [db.settings], async () => {
    if (!await db.settings.get('app')) {
      await db.settings.put({ ...defaultSettings, updatedAt: Date.now() });
    }
  });
}
