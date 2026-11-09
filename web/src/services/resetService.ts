import { db } from '../db/db';
import { initializeDatabase } from '../db/seed';

/**
 * Clears every table, then re-seeds the sample courses and default settings.
 * The caller must export a backup before invoking this.
 */
export async function resetAllData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map(table => table.clear()));
  });
  await initializeDatabase();
}
