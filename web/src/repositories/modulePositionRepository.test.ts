import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { initializeDatabase } from '../db/seed';
import { getModulePosition, saveModulePosition } from './modulePositionRepository';

describe('module position repository', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
  });

  it('returns undefined before anything is saved', async () => {
    expect(await getModulePosition('sample-1-word')).toBeUndefined();
  });

  it('remembers the last word and question for a module', async () => {
    await saveModulePosition('sample-1-word', { wordId: 'sample-1-w3' });
    await saveModulePosition('sample-1-grammar', { questionId: 'sample-1-g4' });
    await saveModulePosition('sample-1-word', { wordId: 'sample-1-w5' });

    expect(await getModulePosition('sample-1-word')).toEqual({ wordId: 'sample-1-w5' });
    expect(await getModulePosition('sample-1-grammar')).toEqual({ questionId: 'sample-1-g4' });
  });

  it('keeps the question position when only the word changes', async () => {
    await saveModulePosition('sample-1-reading', { questionId: 'sample-1-r2' });
    await saveModulePosition('sample-1-reading', { wordId: 'ignored' });
    expect(await getModulePosition('sample-1-reading')).toEqual({ questionId: 'sample-1-r2', wordId: 'ignored' });
  });
});
