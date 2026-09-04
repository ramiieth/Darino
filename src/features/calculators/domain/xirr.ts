/**
 * ۴) XIRR — نرخ بازده واقعی با جریان‌های نقدی در تاریخ‌های مختلف
 *
 * معادله: Σ CashFlowᵢ ÷ (1+r)^((Dateᵢ−Date₀)/365) = 0
 * حل عددی: Newton-Raphson (با Decimal) + فالبک Bisection در صورت عدم همگرایی
 */
import { D, Decimal, round12, safeDiv } from './money';

export interface CashFlow {
  /** تاریخ (ms) */
  date: number;
  /** مقدار (منفی = واریز/سرمایه‌گذاری، مثبت = برداشت/ارزش) */
  amount: number;
}

export interface XirrResult {
  /** نرخ سالانه (کسری) یا null در صورت عدم همگرایی */
  xirr: number | null;
  iterations: number;
  /** مجموع جریان‌های مثبت (برداشت‌ها) */
  totalInflows: number;
  /** مجموع جریان‌های منفی (واریزها) */
  totalOutflows: number;
  /** سود کل = ورودی − خروجی */
  totalProfit: number | null;
}

/** تابع هدف: f(r) = Σ cf / (1+r)^t */
function f(r: Decimal, flows: { t: Decimal; amount: Decimal }[]): Decimal {
  let sum = new Decimal(0);
  const one = new Decimal(1);
  for (const cf of flows) {
    const denom = one.plus(r).pow(cf.t);
    const div = safeDiv(cf.amount, denom);
    if (div) sum = sum.plus(div);
  }
  return sum;
}

/** مشتق: f'(r) = Σ −cf·t / (1+r)^(t+1) */
function fPrime(r: Decimal, flows: { t: Decimal; amount: Decimal }[]): Decimal {
  let sum = new Decimal(0);
  const one = new Decimal(1);
  for (const cf of flows) {
    const denom = one.plus(r).pow(cf.t.plus(1));
    const div = safeDiv(cf.amount.mul(cf.t).neg(), denom);
    if (div) sum = sum.plus(div);
  }
  return sum;
}

const TOL = new Decimal('1e-12');
const MAX_ITER = 80;

export function calcXirr(flows: CashFlow[]): XirrResult {
  const totalInflows = flows.filter((f) => f.amount > 0).reduce((a, f) => a + f.amount, 0);
  const totalOutflows = Math.abs(flows.filter((f) => f.amount < 0).reduce((a, f) => a + f.amount, 0));

  // پیش‌شرط: حداقل ۲ جریان با یک مثبت و یک منفی
  if (flows.length < 2 || totalInflows <= 0 || totalOutflows <= 0) {
    return { xirr: null, iterations: 0, totalInflows, totalOutflows, totalProfit: null };
  }

  const t0 = flows[0].date;
  const prepared = flows.map((f) => ({
    t: new Decimal((f.date - t0) / (365 * 86_400_000)),
    amount: D(f.amount)
  }));

  // ---------- Newton-Raphson ----------
  let r = new Decimal(0.1);
  let iterations = 0;
  let converged = false;

  for (let i = 0; i < MAX_ITER; i++) {
    iterations++;
    const fx = f(r, prepared);
    if (fx.abs().lt(TOL)) {
      converged = true;
      break;
    }
    const d = fPrime(r, prepared);
    if (d.abs().lt(TOL)) break; // مشتق تقریباً صفر → خروج از نیوتن
    const step = safeDiv(fx, d);
    if (step === null) break;
    let next = r.minus(step);
    // محدوده معتبر: r > −1
    if (next.lte(-0.999999)) next = r.div(2).minus(0.1);
    r = next;
  }

  if (!converged) {
    // بررسی همگرایی نهایی
    converged = f(r, prepared).abs().lt(new Decimal('1e-6'));
  }

  if (!converged) {
    // ---------- فالبک Bisection ----------
    let lo = new Decimal(-0.9999);
    let hi = new Decimal(10);
    let flo = f(lo, prepared);
    let fhi = f(hi, prepared);
    iterations = 0;

    if (flo.mul(fhi).gt(0)) {
      // ریشه در بازه نیست → بازه را گسترش بده
      for (let i = 0; i < 40; i++) {
        hi = hi.mul(2);
        fhi = f(hi, prepared);
        if (flo.mul(fhi).lte(0)) break;
      }
    }

    for (let i = 0; i < 200; i++) {
      iterations++;
      const mid = lo.plus(hi).div(2);
      const fm = f(mid, prepared);
      if (fm.abs().lt(TOL)) {
        r = mid;
        converged = true;
        break;
      }
      if (flo.mul(fm).lte(0)) {
        hi = mid;
        fhi = fm;
      } else {
        lo = mid;
        flo = fm;
      }
    }
  }

  const xirr = converged ? round12(r) : null;
  const totalProfit =
    totalInflows > 0 && totalOutflows > 0 ? round12(D(totalInflows).minus(D(totalOutflows))) : null;

  return { xirr, iterations, totalInflows, totalOutflows, totalProfit };
}
