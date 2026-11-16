import type { WordReviewStatus } from '../types/domain';
import type { SessionEntry, WordSession } from '../types/domain';
import { todayKey } from '../utils/date';

/**
 * 会话内学习队列：答错的词回到队列，答对两次才毕业。
 *
 * 这只是「今天这一轮」的调度，不参与长期间隔；长期排期仍由
 * wordReviewRules 决定。队列可序列化后存进设置，刷新或切模块能续上。
 */

export const GRADUATE_STREAK = 2;
export const PASS_WRONG_COUNT = 3;

const UNKNOWN_GAP = 3;
const FUZZY_GAP = 6;
const KNOWN_GAP = 4;

export function startWordSession(scope: string, ids: string[], now: Date = new Date()): WordSession {
  return {
    scope,
    dateKey: todayKey(now),
    queue: [...ids],
    entries: Object.fromEntries(ids.map(id => [id, { correctStreak: 0, wrongCount: 0, fuzzyUsed: false }])),
    mastered: 0,
    total: ids.length,
    startedAt: now.getTime()
  };
}

/** 跨天或换了模块就从新队列开始；否则沿用已保存的进度。 */
export function resumeWordSession(
  saved: WordSession | undefined,
  scope: string,
  ids: string[],
  now: Date = new Date()
): WordSession {
  if (!saved || saved.scope !== scope || saved.dateKey !== todayKey(now)) return startWordSession(scope, ids, now);
  const known = new Set(ids);
  const queue = saved.queue.filter(id => known.has(id));
  // 队列里丢过词（例如课程重新生成）时，把缺的补到末尾，避免少学。
  for (const id of ids) if (!queue.includes(id) && !(saved.entries[id]?.passed)) {
    const entry = saved.entries[id];
    if (!entry || entry.correctStreak < GRADUATE_STREAK) queue.push(id);
  }
  return { ...saved, queue, total: ids.length };
}

function insertAt(queue: string[], id: string, gap: number): string[] {
  const next = [...queue];
  next.splice(Math.min(gap, next.length), 0, id);
  return next;
}

export interface RateResult {
  session: WordSession;
  /** 本次评级是否让该词毕业（连续答对达到 2 次） */
  graduated: boolean;
  /** 是否因为连续答错而当天放行 */
  passed: boolean;
  /** 队列是否已经全部完成 */
  finished: boolean;
}

/**
 * 记录一次评级。`id` 必须在队列中（通常是队首）。
 * 「认识」连续两次毕业；「模糊」不清零但也不计入连对，只回插一次；
 * 「不认识」清零并靠前回插，连续三次当天放行。
 */
export function rateSessionWord(session: WordSession, id: string, status: WordReviewStatus): RateResult {
  const queue = session.queue.filter(item => item !== id);
  const entry = session.entries[id] ?? { correctStreak: 0, wrongCount: 0, fuzzyUsed: false };
  const next: SessionEntry = { ...entry };
  let gap = UNKNOWN_GAP;
  let graduated = false;
  let passed = false;

  if (status === 'known') {
    next.correctStreak += 1;
    if (next.correctStreak >= GRADUATE_STREAK) graduated = true;
    else gap = KNOWN_GAP;
  } else if (status === 'fuzzy') {
    if (!next.fuzzyUsed) {
      next.fuzzyUsed = true;
      gap = FUZZY_GAP;
    } else {
      // 已经模糊过一次仍未记住：按不认识处理，靠前回插。
      next.correctStreak = 0;
      next.wrongCount += 1;
      if (next.wrongCount >= PASS_WRONG_COUNT) passed = true;
    }
  } else {
    next.correctStreak = 0;
    next.wrongCount += 1;
    if (next.wrongCount >= PASS_WRONG_COUNT) passed = true;
  }

  const entries = { ...session.entries, [id]: passed ? { ...next, passed: true } : next };
  if (graduated || passed) {
    return finish({ ...session, queue, entries, ...(graduated ? { mastered: session.mastered + 1 } : {}) }, graduated, passed);
  }
  return finish({ ...session, queue: insertAt(queue, id, gap), entries });
}

function finish(session: WordSession, graduated = false, passed = false): RateResult {
  return { session, graduated, passed, finished: session.queue.length === 0 };
}

/** 完成度：已毕业数 / 总数，用于进度条与「已掌握」文案。 */
export function sessionProgress(session: WordSession): { mastered: number; total: number; remaining: number } {
  const remaining = session.queue.length;
  return { mastered: session.mastered, total: session.total, remaining };
}
