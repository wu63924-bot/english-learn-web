export class RateLimiter {
  private readonly max: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private hits = new Map<string, number[]>();

  constructor(max: number, windowMs: number, now: () => number = Date.now) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
  }

  allow(key: string): boolean {
    const time = this.now();
    const recent = (this.hits.get(key) ?? []).filter(stamp => time - stamp < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(time);
    this.hits.set(key, recent);
    if (this.hits.size > 500) this.prune(time);
    return true;
  }

  private prune(time: number): void {
    for (const [key, stamps] of this.hits) {
      if (!stamps.some(stamp => time - stamp < this.windowMs)) this.hits.delete(key);
    }
  }
}
