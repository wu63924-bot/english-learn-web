import { describe, expect, it } from 'vitest';
import type { KnowledgePoint } from '../types/domain';
import { applyAttempt, dueKnowledge, isDue, reviewReasonText } from './reviewRules';

function point(overrides: Partial<KnowledgePoint> = {}): KnowledgePoint {
  return {
    id: 'k1',
    label: '一般现在时第三人称单数',
    kind: 'grammar',
    stage: 1,
    status: 'learning',
    correctStreak: 0,
    wrongStreak: 0,
    updatedAt: 0,
    ...overrides
  };
}

describe('review rules', () => {
  it('does not drop a mastered point after a single wrong answer', () => {
    const mastered = point({ status: 'mastered', correctStreak: 3 });
    const first = applyAttempt(mastered, false, '2026-11-09');
    expect(first.point.status).toBe('mastered');
    expect(first.point.wrongStreak).toBe(1);
    expect(first.nextDue).toBe('2026-11-10');

    const second = applyAttempt(first.point, false, '2026-11-10');
    expect(second.point.status).toBe('needs_review');
    expect(reviewReasonText(second.point)).toContain('答错');
  });

  it('does not lift a needs_review point after a single correct answer', () => {
    const weak = point({ status: 'needs_review', wrongStreak: 2 });
    const once = applyAttempt(weak, true, '2026-11-09');
    expect(once.point.status).toBe('needs_review');
    expect(once.nextDue).toBe('2026-11-10');

    const twice = applyAttempt(once.point, true, '2026-11-11');
    expect(twice.point.status).toBe('learning');
  });

  it('promotes to mastered only after three consecutive correct answers', () => {
    let current = point({ status: 'learning' });
    current = applyAttempt(current, true, '2026-11-09').point;
    expect(current.status).toBe('learning');
    expect(current.nextReviewDate).toBe('2026-11-10');

    current = applyAttempt(current, true, '2026-11-10').point;
    expect(current.status).toBe('learning');
    expect(current.nextReviewDate).toBe('2026-11-13');

    current = applyAttempt(current, true, '2026-11-13').point;
    expect(current.status).toBe('mastered');
    expect(current.nextReviewDate).toBe('2026-11-27');

    current = applyAttempt(current, true, '2026-11-27').point;
    expect(current.nextReviewDate).toBe('2026-12-11');
  });

  it('resets the correct streak on a wrong answer', () => {
    const almost = point({ status: 'learning', correctStreak: 2 });
    const failed = applyAttempt(almost, false, '2026-11-09');
    expect(failed.point.correctStreak).toBe(0);
    expect(failed.point.wrongStreak).toBe(1);
    expect(failed.point.status).toBe('learning');
  });

  it('marks imported needs_review points as due immediately', () => {
    const imported = point({ id: 'history-k1', status: 'needs_review', source: 'import' });
    expect(isDue(imported, '2026-11-09')).toBe(true);
    const upcoming = point({ id: 'k2', status: 'learning', nextReviewDate: '2026-11-12' });
    expect(isDue(upcoming, '2026-11-09')).toBe(false);
    expect(dueKnowledge([imported, upcoming], '2026-11-09').map(item => item.id)).toEqual(['history-k1']);
  });

  it('starts a new point as learning on its first attempt', () => {
    const unseen = point({ status: 'unseen' });
    expect(applyAttempt(unseen, false, '2026-11-09').point.status).toBe('learning');
    expect(applyAttempt(unseen, true, '2026-11-09').point.status).toBe('learning');
  });
});
