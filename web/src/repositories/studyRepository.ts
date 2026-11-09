import { db } from '../db/db';
import type { StudyDay } from '../types/domain';
import { todayKey } from '../utils/date';

/** A day counts as a study day after 5 minutes or at least one completed module. */
export const ACTIVE_DAY_SECONDS = 300;

export async function addStudySeconds(seconds: number, modulesCompleted = 0): Promise<void> {
  const key = todayKey();
  const now = Date.now();
  const added = Math.max(0, Math.round(seconds));
  if (added === 0 && modulesCompleted === 0) return;
  await db.transaction('rw', db.studyDays, async () => {
    const current = await db.studyDays.get(key);
    const next: StudyDay = current
      ? {
          ...current,
          seconds: current.seconds + added,
          modulesCompleted: current.modulesCompleted + modulesCompleted,
          lastActiveAt: now
        }
      : {
          dateKey: key,
          seconds: added,
          coursesCompleted: 0,
          modulesCompleted,
          firstActiveAt: now,
          lastActiveAt: now
        };
    await db.studyDays.put(next);
  });
}

export async function addCompletedCourse(): Promise<void> {
  const key = todayKey();
  const now = Date.now();
  await db.transaction('rw', db.studyDays, async () => {
    const current = await db.studyDays.get(key);
    const next: StudyDay = current
      ? { ...current, coursesCompleted: current.coursesCompleted + 1, lastActiveAt: now }
      : {
          dateKey: key,
          seconds: 0,
          coursesCompleted: 1,
          modulesCompleted: 0,
          firstActiveAt: now,
          lastActiveAt: now
        };
    await db.studyDays.put(next);
  });
}

export interface StudySummary {
  todaySeconds: number;
  todayMinutes: number;
  activeDays: number;
}

export async function getStudySummary(): Promise<StudySummary> {
  const today = await db.studyDays.get(todayKey());
  const days = await db.studyDays.toArray();
  return {
    todaySeconds: today?.seconds ?? 0,
    todayMinutes: Math.round((today?.seconds ?? 0) / 60),
    activeDays: days.filter(day => day.seconds >= ACTIVE_DAY_SECONDS || day.modulesCompleted > 0).length
  };
}
