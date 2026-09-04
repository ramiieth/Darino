/**
 * صف محدودکننده نرخ درخواست (Rate-Limited Request Queue)
 *
 * قواعد:
 *  - حداکثر `maxPerWindow` درخواست در هر `windowMs` (لگارتم سطل توکن).
 *  - حداقل `minGapMs` میلی‌ثانیه بین شروع دو درخواست (آلفا وانتج: ۵/دقیقه → ۱۲٬۰۰۰ms).
 *  - شکست‌های ۴۲۹ باعث فعال شدن «قطع‌کننده مدار» برای `cooldownMs` می‌شوند.
 *  - تک‌تک درخواست‌ها به صف اضافه می‌شوند و به‌ترتیب اجرا می‌شوند.
 */
export interface QueueStats {
  pending: number;
  running: number;
  lastRunAt: number | null;
  circuitOpenUntil: number | null;
}

type Task<T> = () => Promise<T>;

interface QueuedTask {
  run: () => Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

export class RateLimitedQueue {
  private queue: QueuedTask[] = [];
  private running = 0;
  private lastRunAt: number | null = null;
  private windowStarts: number[] = [];
  private circuitOpenUntil: number | null = null;
  private onStats?: (s: QueueStats) => void;

  constructor(
    private readonly minGapMs: number,
    private readonly maxPerWindow: number,
    private readonly windowMs: number,
    private readonly cooldownMs = 60_000
  ) {}

  setStatsListener(fn?: (s: QueueStats) => void): void {
    this.onStats = fn;
  }

  /** ریست کامل صف (برای تست‌ها) */
  reset(): void {
    this.queue = [];
    this.running = 0;
    this.lastRunAt = null;
    this.windowStarts = [];
    this.circuitOpenUntil = null;
  }

  getStats(): QueueStats {
    return {
      pending: this.queue.length,
      running: this.running,
      lastRunAt: this.lastRunAt,
      circuitOpenUntil: this.circuitOpenUntil
    };
  }

  private emitStats(): void {
    this.onStats?.(this.getStats());
  }

  /** باز کردن مدار پس از خطای 429 */
  private openCircuit(): void {
    this.circuitOpenUntil = Date.now() + this.cooldownMs;
    this.emitStats();
  }

  /** آیا مدار باز است؟ */
  private isCircuitOpen(): boolean {
    if (this.circuitOpenUntil === null) return false;
    if (Date.now() >= this.circuitOpenUntil) {
      this.circuitOpenUntil = null;
      return false;
    }
    return true;
  }

  /** پاک کردن پنجره‌های منقضی */
  private pruneWindow(): void {
    const cutoff = Date.now() - this.windowMs;
    this.windowStarts = this.windowStarts.filter((t) => t > cutoff);
  }

  /** محاسبه زمان انتظار تا مجاز شدن درخواست بعدی */
  private waitTimeUntilSlot(): number {
    this.pruneWindow();
    const now = Date.now();
    let t = now;

    // فاصله حداقلی از شروع آخرین درخواست
    if (this.lastRunAt !== null) {
      t = Math.max(t, this.lastRunAt + this.minGapMs);
    }

    // سهمیه پنجره
    if (this.windowStarts.length >= this.maxPerWindow) {
      const oldest = Math.min(...this.windowStarts);
      t = Math.max(t, oldest + this.windowMs + 1);
    }

    if (this.isCircuitOpen() && this.circuitOpenUntil !== null) {
      t = Math.max(t, this.circuitOpenUntil);
    }

    return Math.max(0, t - now);
  }

  enqueue<T>(task: Task<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        run: task as () => Promise<unknown>,
        resolve: resolve as (v: unknown) => void,
        reject
      });
      this.emitStats();
      void this.pump();
    });
  }

  private async pump(): Promise<void> {
    if (this.running > 0) return;
    this.running = 1;

    while (this.queue.length > 0) {
      if (this.isCircuitOpen()) {
        // مدار باز: همه درخواست‌های صف‌شده با خطای 429 رد می‌شوند تا منفجر نشود
        const task = this.queue.shift();
        if (task) task.reject(new RateLimitError('Rate limiter circuit breaker open'));
        this.emitStats();
        continue;
      }

      const wait = this.waitTimeUntilSlot();
      if (wait > 0) {
        await sleep(wait);
        continue;
      }

      const task = this.queue.shift();
      if (!task) break;

      this.lastRunAt = Date.now();
      this.windowStarts.push(this.lastRunAt);
      this.emitStats();

      try {
        const result = await task.run();
        task.resolve(result);
      } catch (e) {
        if (isRateLimitError(e)) {
          this.openCircuit();
          // بقیه صف فعلاً صبر می‌کنند؛ فقط همین درخواست رد می‌شود
        }
        task.reject(e);
      }
    }

    this.running = 0;
    this.emitStats();
  }
}

/** خطای محدودیت نرخ */
export class RateLimitError extends Error {
  retryAfterMs: number;
  constructor(message = 'Rate limited (429)', retryAfterMs = 60_000) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export function isRateLimitError(e: unknown): boolean {
  return e instanceof RateLimitError || (e instanceof Error && e.message.includes('429'));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
