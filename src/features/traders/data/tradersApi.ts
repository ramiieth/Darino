/**
 * دادهٔ تریدرهای برتر
 *  - فهرست برترین‌ها: /api/traders (سرور لیدربورد ۴۰ مگابایتی را خلاصه و کش می‌کند)
 *  - سابقهٔ هر آدرس: مستقیم از API رسمی info هایپرلیکوئید روی IP کاربر
 *
 * سقف هایپرلیکوئید وزنی است (~۱۲۰۰ در دقیقه برای هر IP): portfolio ≈ ۲۰، userFills با ۲۰۰۰ ردیف ≈ ۱۲۰.
 * صف وزنی زیر ۸۰۰ در دقیقه می‌ماند تا بقیهٔ اپ (پرپ‌ها، اسکنر) هم جا داشته باشند.
 */
import { hlPortfolio, hlRecentFills, type HlFill } from '@/features/hyperliquid/data/hyperliquidService';
import type { Candidate } from '../domain/candidates';
import type { HlPortfolio } from '../domain/types';
import type { TraderSummary } from '../domain/summary';
import type { TraderPosition } from '../domain/positions';

export interface TradersList {
  fetchedAt: number;
  totalAccounts: number;
  candidates: Candidate[];
  stale?: boolean;
}

export const WEIGHT = { portfolio: 20, fills: 120 } as const;
const BUDGET_PER_MIN = 800;

interface Job { weight: number; priority: number; seq: number; key?: string; start: () => void }
const jobs: Job[] = [];
let tokens = BUDGET_PER_MIN / 2;
let refilledAt = Date.now();
let pumping = false;
let seq = 0;

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    while (jobs.length) {
      jobs.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
      const job = jobs[0];
      const now = Date.now();
      tokens = Math.min(BUDGET_PER_MIN / 2, tokens + ((now - refilledAt) / 60_000) * BUDGET_PER_MIN);
      refilledAt = now;
      if (tokens < job.weight) {
        await new Promise((r) => setTimeout(r, ((job.weight - tokens) / BUDGET_PER_MIN) * 60_000));
        continue;
      }
      tokens -= job.weight;
      jobs.shift();
      job.start();
    }
  } finally {
    pumping = false;
  }
}

/** سطل توکن وزنی؛ priority کمتر زودتر (منحنی حساب قبل از سابقهٔ سنگین معاملات) */
export function weighted<T>(weight: number, task: () => Promise<T>, priority = 1, key?: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    jobs.push({ weight, priority, seq: seq++, key, start: () => void task().then(resolve, reject) });
    void pump();
  });
}

/** کارنامه‌ای که کاربر باز کرده جلوی صف می‌رود (درخواست در صف همان می‌ماند، فقط زودتر اجرا می‌شود) */
export function prioritize(address: string): void {
  for (const j of jobs) if (j.key === address) j.priority = -1;
}

async function getPublic<T>(url: string, ok: (b: T) => boolean, fallback: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body || !ok(body)) throw new Error(body?.error ?? fallback);
  return body;
}

export const fetchTradersList = () => getPublic<TradersList>('/api/traders', (b) => Array.isArray(b.candidates), 'فهرست تریدرها دریافت نشد');

export interface SummariesResponse { summaries: Record<string, TraderSummary>; pending: number }
export const fetchSummaries = (addresses: string[]) =>
  getPublic<SummariesResponse>(`/api/traders?op=summaries&addresses=${addresses.join(',')}`, (b) => !!b.summaries, 'خلاصهٔ تریدرها دریافت نشد');

export interface PositionsResponse { fetchedAt: number; traders: number; steadyTraders: number; positions: TraderPosition[] }
export const fetchPositions = () => getPublic<PositionsResponse>('/api/traders?op=positions', (b) => Array.isArray(b.positions), 'پوزیشن‌های برترها دریافت نشد');

export const fetchPortfolio = (address: string) => weighted(WEIGHT.portfolio, () => hlPortfolio<HlPortfolio>(address), 0, address);
export const fetchFills = (address: string) => weighted(WEIGHT.fills, () => hlRecentFills(address), 1, address) as Promise<HlFill[]>;
