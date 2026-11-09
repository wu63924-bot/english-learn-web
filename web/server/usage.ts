import { ApiError } from './errors.ts';

export interface UsageSnapshot {
  day: string;
  requests: number;
  tokens: number;
  maxRequests: number;
  maxTokens: number;
}

function localDay(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * In-memory daily usage ledger. It resets at the local day boundary and on
 * process restart; the client keeps the durable record in IndexedDB.
 */
export class UsageLedger {
  private readonly maxRequests: number;
  private readonly maxTokens: number;
  private readonly clock: () => Date;
  private day = '';
  private requests = 0;
  private tokens = 0;

  constructor(maxRequests: number, maxTokens: number, clock: () => Date = () => new Date()) {
    this.maxRequests = maxRequests;
    this.maxTokens = maxTokens;
    this.clock = clock;
  }

  check(): void {
    this.resetIfNeeded();
    if (this.requests >= this.maxRequests) throw new ApiError('BUDGET_EXCEEDED', `今日 AI 调用次数已达上限（${this.maxRequests} 次）`);
    if (this.tokens >= this.maxTokens) throw new ApiError('BUDGET_EXCEEDED', `今日 AI 用量已达上限（${this.maxTokens} tokens）`);
  }

  record(tokensIn: number, tokensOut: number): void {
    this.resetIfNeeded();
    this.requests += 1;
    this.tokens += Math.max(0, tokensIn) + Math.max(0, tokensOut);
  }

  snapshot(): UsageSnapshot {
    this.resetIfNeeded();
    return {
      day: this.day,
      requests: this.requests,
      tokens: this.tokens,
      maxRequests: this.maxRequests,
      maxTokens: this.maxTokens
    };
  }

  private resetIfNeeded(): void {
    const today = localDay(this.clock());
    if (today === this.day) return;
    this.day = today;
    this.requests = 0;
    this.tokens = 0;
  }
}
