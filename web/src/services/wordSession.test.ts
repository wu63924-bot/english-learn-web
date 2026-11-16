import { describe, expect, it } from 'vitest';
import {
  GRADUATE_STREAK,
  PASS_WRONG_COUNT,
  rateSessionWord,
  resumeWordSession,
  sessionProgress,
  startWordSession
} from './wordSession';

const now = new Date(2026, 10, 16, 9, 0, 0);
const ids = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8'];

describe('word session queue', () => {
  it('graduates a word after two correct answers in a row', () => {
    let session = startWordSession('module', ids, now);
    expect(session.queue[0]).toBe('w1');

    let result = rateSessionWord(session, 'w1', 'known');
    expect(result.graduated).toBe(false);
    session = result.session;
    expect(session.queue).toContain('w1');
    // Reinserted after four new words, not immediately.
    expect(session.queue.indexOf('w1')).toBe(4);

    result = rateSessionWord(session, 'w1', 'known');
    expect(result.graduated).toBe(true);
    expect(result.session.queue).not.toContain('w1');
    expect(result.session.mastered).toBe(1);
  });

  it('resets the streak and reinserts an unknown word earlier', () => {
    let session = startWordSession('module', ids, now);
    let result = rateSessionWord(session, 'w1', 'known');
    session = result.session;
    result = rateSessionWord(session, 'w1', 'unknown');
    session = result.session;
    expect(session.entries.w1.correctStreak).toBe(0);
    expect(session.entries.w1.wrongCount).toBe(1);
    expect(session.queue.indexOf('w1')).toBe(3);
  });

  it('passes a word after three wrong attempts without blocking the session', () => {
    let session = startWordSession('module', ids, now);
    for (let attempt = 0; attempt < PASS_WRONG_COUNT; attempt += 1) {
      const result = rateSessionWord(session, 'w1', 'unknown');
      session = result.session;
      if (attempt < PASS_WRONG_COUNT - 1) expect(session.queue).toContain('w1');
    }
    expect(session.queue).not.toContain('w1');
    expect(session.entries.w1.passed).toBe(true);
    expect(session.entries.w1.wrongCount).toBe(PASS_WRONG_COUNT);
  });

  it('reinserts a fuzzy word once, then treats it as unknown', () => {
    let session = startWordSession('module', ids, now);
    let result = rateSessionWord(session, 'w1', 'fuzzy');
    session = result.session;
    expect(session.entries.w1.fuzzyUsed).toBe(true);
    expect(session.queue.indexOf('w1')).toBe(6);

    result = rateSessionWord(session, 'w1', 'fuzzy');
    session = result.session;
    expect(session.entries.w1.wrongCount).toBe(1);
    expect(session.queue.indexOf('w1')).toBe(3);
  });

  it('finishes only when the queue is empty', () => {
    let session = startWordSession('module', ['a', 'b'], now);
    let result = rateSessionWord(session, 'a', 'known');
    session = result.session;
    expect(result.finished).toBe(false);

    result = rateSessionWord(session, 'b', 'known');
    session = result.session;
    expect(result.finished).toBe(false);

    result = rateSessionWord(session, 'a', 'known');
    expect(result.finished).toBe(false);
    result = rateSessionWord(result.session, 'b', 'known');
    expect(result.finished).toBe(true);
    expect(sessionProgress(result.session)).toEqual({ mastered: 2, total: 2, remaining: 0 });
  });

  it('resumes a saved session on the same day and restarts on a new day', () => {
    let session = startWordSession('module', ids, now);
    session = rateSessionWord(session, 'w1', 'unknown').session;

    const resumed = resumeWordSession(session, 'module', ids, new Date(2026, 10, 16, 18, 0, 0));
    expect(resumed.queue[0]).toBe('w2');
    expect(resumed.queue).toContain('w1');

    const fresh = resumeWordSession(session, 'module', ids, new Date(2026, 10, 17, 8, 0, 0));
    expect(fresh.queue).toEqual(ids);
    expect(fresh.mastered).toBe(0);

    const otherScope = resumeWordSession(session, 'other', ids, now);
    expect(otherScope.queue).toEqual(ids);
  });

  it('keeps the graduate threshold at two correct answers', () => {
    expect(GRADUATE_STREAK).toBe(2);
  });
});
