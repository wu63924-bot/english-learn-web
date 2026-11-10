import { db } from './db';
import type { AppSettings } from '../types/domain';
import { sampleCourseBundles } from '../data/sampleCourses';

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
  await seedSampleCourses();
  await db.transaction('rw', [db.settings], async () => {
    if (!await db.settings.get('app')) {
      await db.settings.put({ ...defaultSettings, updatedAt: Date.now() });
    }
  });
}

/**
 * Writes the sample courses once. An existing course id is left untouched,
 * so edits made later (and any progress) are never replaced on boot.
 */
export async function seedSampleCourses(): Promise<void> {
  const settings = await db.settings.get('app');
  if (settings?.samplesSeededAt) return;

  await db.transaction('rw', [db.courses, db.courseModules, db.knowledge, db.settings], async () => {
    for (const bundle of sampleCourseBundles) {
      if (await db.courses.get(bundle.course.id)) continue;
      await db.courses.put(bundle.course);
      await db.courseModules.bulkPut(bundle.modules);
      for (const point of bundle.knowledge) {
        if (!await db.knowledge.get(point.id)) await db.knowledge.put(point);
      }
    }
    const current = await db.settings.get('app');
    await db.settings.put({
      ...(current ?? defaultSettings),
      samplesSeededAt: Date.now(),
      updatedAt: Date.now()
    });
  });
}
