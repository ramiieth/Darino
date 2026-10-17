/**
 * قواعد اعلان — منطق خالص (بدون شبکه)، مشترک بین سرور و کلاینت
 *
 *  ۱) برعکس‌شدن اسپرد فاندینگ برای جفت‌های پایش‌شده در «اسکنر فاندینگ»
 *  ۲) نزدیک شدن به لیکویید در حساب‌های لایتر و آرکوس (فقط‌خواندنی، با آدرس عمومی)
 */

export type AlertVenue = 'arcus' | 'ondo' | 'lighter';

export interface FundingWatch {
  key: string;
  base: string;
  shortVenue: AlertVenue;
  shortRef: string;
  longVenue: AlertVenue;
  longRef: string;
  /** آخرین علامت دیده‌شده: ۱ = به نفع، -۱ = برعکس */
  lastSign: 1 | -1;
}

export interface AlertRules {
  funding: FundingWatch[];
  liquidation: { enabled: boolean; thresholdPct: number };
}

export const DEFAULT_RULES: AlertRules = { funding: [], liquidation: { enabled: true, thresholdPct: 15 } };
export const MAX_WATCHES = 30;

const VENUES: AlertVenue[] = ['arcus', 'ondo', 'lighter'];
const REF_RE = /^[A-Za-z0-9.-]{1,24}$/;

/** ورودی کلاینت را سخت‌گیرانه می‌سنجد؛ هر چیز نامعتبر کنار می‌رود */
export function sanitizeRules(raw: unknown): AlertRules {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<AlertRules>;
  const funding = (Array.isArray(r.funding) ? r.funding : [])
    .filter((w): w is FundingWatch => {
      const x = w as Partial<FundingWatch> | null;
      return !!x && typeof x.key === 'string' && x.key.length <= 80 && typeof x.base === 'string' && /^[A-Za-z0-9]{1,20}$/.test(x.base) &&
        VENUES.includes(x.shortVenue as AlertVenue) && VENUES.includes(x.longVenue as AlertVenue) && x.shortVenue !== x.longVenue &&
        typeof x.shortRef === 'string' && REF_RE.test(x.shortRef) && typeof x.longRef === 'string' && REF_RE.test(x.longRef);
    })
    .slice(0, MAX_WATCHES)
    .map((w) => ({ key: w.key, base: w.base, shortVenue: w.shortVenue, shortRef: w.shortRef, longVenue: w.longVenue, longRef: w.longRef, lastSign: w.lastSign === -1 ? -1 : 1 }) as FundingWatch);
  const liq = (r.liquidation ?? {}) as Partial<AlertRules['liquidation']>;
  const pct = Number(liq.thresholdPct);
  return {
    funding: [...new Map(funding.map((w) => [w.key, w])).values()],
    liquidation: { enabled: liq.enabled !== false, thresholdPct: Number.isFinite(pct) ? Math.min(80, Math.max(1, pct)) : DEFAULT_RULES.liquidation.thresholdPct }
  };
}

export const VENUE_FA: Record<AlertVenue, string> = { arcus: 'آرکوس', ondo: 'اوندو پرپس', lighter: 'لایتر' };

export interface FundingFlip {
  watch: FundingWatch;
  sign: 1 | -1;
  /** اسپرد لحظه‌ای به نفع این جهت (٪ سالانه) */
  apr: number;
}

/** نرخ‌ها: کلید `venue:ref` → نرخ فاندینگ ساعتی (کسری، مثبت = لانگ می‌پردازد) */
export function evaluateFunding(watches: FundingWatch[], rates: ReadonlyMap<string, number>): { flips: FundingFlip[]; next: FundingWatch[] } {
  const flips: FundingFlip[] = [];
  const next = watches.map((w) => {
    const s = rates.get(`${w.shortVenue}:${w.shortRef}`);
    const l = rates.get(`${w.longVenue}:${w.longRef}`);
    if (s === undefined || l === undefined) return w;
    const apr = (s - l) * 8760 * 100;
    const sign: 1 | -1 = apr > 0 ? 1 : -1;
    if (sign === w.lastSign) return w;
    flips.push({ watch: w, sign, apr });
    return { ...w, lastSign: sign };
  });
  return { flips, next };
}

export function fundingMessage(f: FundingFlip): { title: string; body: string } {
  const pair = `${f.watch.base}: Long ${VENUE_FA[f.watch.longVenue]} / Short ${VENUE_FA[f.watch.shortVenue]}`;
  const apr = `${f.apr >= 0 ? '+' : ''}${f.apr.toFixed(1)}٪ سالانه`;
  return f.sign < 0
    ? { title: 'اسپرد فاندینگ برعکس شد', body: `${pair} — الان این جهت فاندینگ می‌پردازد (${apr}). خروج یا جابه‌جایی را بررسی کنید.` }
    : { title: 'اسپرد فاندینگ دوباره به نفع شد', body: `${pair} — ${apr}.` };
}

/* ---------------- لیکویید ---------------- */

export interface LiqExposure {
  /** شناسهٔ پایدار برای جلوگیری از هشدار تکراری */
  key: string;
  label: string;
  /** حرکت قیمت تا لیکویید (٪)؛ null = نامعلوم/بدون خطر */
  distancePct: number | null;
  approximate: boolean;
}

const n = (v: unknown): number | null => {
  const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(x) ? x : null;
};

/** پوزیشن‌های لایتر: قیمت لیکویید از API؛ قیمت مارک = ارزش پوزیشن ÷ اندازه */
export function lighterExposures(platform: string, address: string, accounts: unknown): LiqExposure[] {
  const list = Array.isArray((accounts as { accounts?: unknown })?.accounts) ? (accounts as { accounts: unknown[] }).accounts : [];
  return list.flatMap((a) => {
    const acc = (a ?? {}) as Record<string, unknown>;
    if (String(acc.l1_address ?? '').toLowerCase() !== address.toLowerCase()) return [];
    const idx = n(acc.account_index ?? acc.index);
    return (Array.isArray(acc.positions) ? acc.positions : []).flatMap((p) => {
      const pos = (p ?? {}) as Record<string, unknown>;
      const size = n(pos.position); const value = n(pos.position_value); const liq = n(pos.liquidation_price);
      if (!size || size <= 0 || ![1, -1].includes(Number(pos.sign))) return [];
      const symbol = String(pos.symbol ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
      const mark = value && value > 0 ? Math.abs(value) / size : null;
      const side = Number(pos.sign) === -1 ? 'Short' : 'Long';
      return [{
        key: `${platform}:${address.toLowerCase()}:${idx}:${symbol}:${side}`,
        label: `${symbol} ${side} — لایتر، حساب ${idx}`,
        distancePct: mark && liq && liq > 0 ? (Math.abs(mark - liq) / mark) * 100 : null,
        approximate: false
      }];
    });
  });
}

/**
 * آرکوس قیمت لیکویید نمی‌دهد (مارجین متقاطع): فاصلهٔ تقریبی = (ارزش حساب − مارجین نگهداری) ÷ کل ارزش پوزیشن‌ها
 * یعنی چند درصد حرکت هم‌زمان همهٔ پوزیشن‌ها علیه شما حساب را به مرز لیکویید می‌رساند.
 */
export function arcusExposure(address: string, accountIndex: number, account: unknown, mmfByMarket: ReadonlyMap<string, number>): LiqExposure[] {
  const acc = (account ?? {}) as { equity?: unknown; positions?: Record<string, unknown> };
  const positions = Object.values(acc.positions ?? {}).map((p) => (p ?? {}) as Record<string, unknown>);
  const equity = n(acc.equity);
  let notional = 0; let maint = 0;
  for (const p of positions) {
    const v = Math.abs(n(p.positionValueNotional) ?? 0);
    notional += v;
    maint += v * (mmfByMarket.get(String(p.marketDisplayName)) ?? 0.05);
  }
  if (!notional || equity === null) return [];
  return [{
    key: `arcus:${address.toLowerCase()}:${accountIndex}`,
    label: `آرکوس، زیرحساب ${accountIndex} (${positions.length} پوزیشن)`,
    distancePct: Math.max(0, ((equity - maint) / notional) * 100),
    approximate: true
  }];
}

export interface LiqState { at: number; pct: number }

const COOLDOWN_MS = 6 * 3600_000;

/**
 * هشدار وقتی فاصله ≤ آستانه؛ تکرار فقط بعد از ۶ ساعت یا اگر فاصله نصف شده باشد.
 * وقتی فاصله به بیش از ۱٫۵ برابر آستانه برگردد، وضعیت پاک می‌شود.
 */
export function evaluateLiquidation(exposures: LiqExposure[], thresholdPct: number, state: Record<string, LiqState>, now: number): { alerts: LiqExposure[]; next: Record<string, LiqState> } {
  const next: Record<string, LiqState> = {};
  const alerts: LiqExposure[] = [];
  for (const e of exposures) {
    const prev = state[e.key];
    if (e.distancePct === null) continue;
    if (e.distancePct > thresholdPct) {
      if (prev && e.distancePct <= thresholdPct * 1.5) next[e.key] = prev;
      continue;
    }
    if (!prev || now - prev.at >= COOLDOWN_MS || e.distancePct <= prev.pct / 2) {
      alerts.push(e);
      next[e.key] = { at: now, pct: e.distancePct };
    } else next[e.key] = prev;
  }
  return { alerts, next };
}

export function liquidationMessage(e: LiqExposure): { title: string; body: string } {
  return {
    title: 'نزدیک لیکویید',
    body: `${e.label}: ${e.approximate ? 'حدود ' : ''}${e.distancePct!.toFixed(1)}٪ حرکت قیمت تا لیکویید. مارجین اضافه کنید یا اندازه را کم کنید.`
  };
}
