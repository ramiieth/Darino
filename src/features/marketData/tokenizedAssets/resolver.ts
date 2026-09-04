/** ============================================================
 * Underlying Resolver — تشخیص دارایی پایه و نوع دارایی (بخش ۱۰/۱۱)
 *
 * اولویت تشخیص Symbol پایه:
 *   Level 1 — متادیتای رسمی CoinGecko (اگر موجود باشد)
 *   Level 2 — ساختار نام توکن («Tesla xStock» / «Apple (Ondo Tokenized Stock)»)
 *   Level 3 — Mapping Table فقط برای Exceptionها (هرگز کل Universe)
 *
 * ⚠️ ممنوع: فرض اینکه همه نمادها با یک Pattern ساده قابل تبدیل‌اند.
 * پسوندزدایی فقط یک «نامزد» می‌سازد که با نام رسمی اعتبارسنجی می‌شود.
 *
 * نوع دارایی: فقط از متادیتای صریح نام؛ بدون حدس خطرناک → OTHER.
 * ============================================================ */
import type { TokenizedAssetType, TokenizedProvider } from './types';

/** ============ Level 3 — Overrides فقط برای Exceptionها (بخش ۱۱) ============ */

export const UNDERLYING_SYMBOL_OVERRIDES: Record<string, string> = {
  // مثال‌های رسمی مشخصات
  'BRK.BX': 'BRK.B',
  VTX: 'VTI'
};

/** ============ نگاشت نام شرکت → نماد پایه (برای اعتبارسنجی نامزد — نه Universe) ============ */

export const COMPANY_TICKER_MAP: Record<string, string> = {
  'Apple': 'AAPL',
  'Microsoft': 'MSFT',
  'NVIDIA': 'NVDA',
  'Tesla': 'TSLA',
  'Amazon': 'AMZN',
  'Alphabet': 'GOOGL',
  'Meta': 'META',
  'Netflix': 'NFLX',
  'Micron Technology': 'MU',
  'Circle Internet Group': 'CRCL',
  'Strategy': 'STRC',
  'Berkshire Hathaway': 'BRK.B',
  'Vanguard Total Stock Market': 'VTI',
  'iShares Core S&P 500': 'IVV',
  'SPDR S&P 500': 'SPY',
  'iShares Bitcoin Trust': 'IBIT',
  'iShares Nasdaq 100': 'QQQ',
  'iShares 20+ Year Treasury Bond': 'TLT',
  'iShares 7-10 Year Treasury Bond': 'IEF',
  // نمادهای تک‌حرفی بورس (از داده واقعی Sync)
  'Visa': 'V',
  'Citigroup': 'C',
  'Ford Motor': 'F',
  'AT&T': 'T'
};

/** ============ پاک‌سازی نام شرکت از نام توکن ============ */

/** حذف نشانه‌های Provider/نوع از نام — باقی‌مانده نام شرکت است */
export function extractCompanyName(tokenName: string): string | null {
  let name = tokenName.trim();
  // حذف پرانتز و محتوای آن: «Circle Internet Group (Ondo Tokenized Stock)»
  name = name.replace(/\s*\(.*?\)\s*/g, ' ').trim();
  // حذف پسوندهای نوع
  name = name
    .replace(/\s*xStock\s*/gi, ' ')
    .replace(/\s*Tokenized Stock\s*/gi, ' ')
    .replace(/\s*Tokenized ETF\s*/gi, ' ')
    .replace(/\s*Tokenized\s*/gi, ' ')
    .replace(/\s*Stock\s*/gi, ' ')
    .replace(/\s*ETF\s*/gi, ' ')
    .trim();
  // حذف پیشوندهای Provider
  name = name.replace(/^(Backed|Ondo)\s+/i, '').trim();
  if (name === '') return null;
  return name;
}

/** ============ نامزد نماد پایه از ساختار نماد توکن (Level 2) ============ */

/**
 * پسوندزدایی فقط یک نامزد می‌سازد:
 *  - BackedFi: TICKERx (مثل TSLAx → TSLA)
 *  - Ondo:     TICKERON (مثل AAPLON → AAPL)
 */
export function tickerCandidate(tokenSymbol: string, provider: TokenizedProvider): string | null {
  const sym = tokenSymbol.toUpperCase();
  // Visa xStock → «VX» → «V» · Citigroup (Ondo) → «CON» → «C»
  if (provider === 'backedfi' && sym.endsWith('X') && sym.length > 1) {
    return sym.slice(0, -1);
  }
  if (provider === 'ondo' && sym.endsWith('ON') && sym.length > 2) {
    return sym.slice(0, -2);
  }
  return null;
}

/** اعتبارسنجی نامزد: نماد معتبر تیکر (۱-۶ حرف/عدد/نقطه؛
 *  تک‌حرفی فقط وقتی نام شرکت در نگاشت شناخته‌شده باشد) */
function isPlausibleTicker(candidate: string, companyName: string | null): boolean {
  if (candidate.length === 1) {
    return !!companyName && COMPANY_TICKER_MAP[companyName] === candidate;
  }
  return /^[A-Z0-9.]{2,6}$/.test(candidate);
}

export interface ResolvedUnderlying {
  underlyingSymbol: string | null;
  underlyingName: string | null;
}

/** ============ Resolver اصلی ============ */

/**
 * تشخیص نماد و نام دارایی پایه:
 *  L1: override صریح
 *  L2: نام شرکت از نام توکن → تطبیق با شرکت‌های شناخته‌شده (HIGH)
 *      یا نام توکن شامل نامزد تیکر (MEDIUM)
 *  L3: نامزد پسوندزدایی با ساختار Provider (فقط اگر معتبر باشد — LOW)
 */
export function resolveUnderlying(
  tokenSymbol: string,
  tokenName: string,
  provider: TokenizedProvider
): ResolvedUnderlying {
  const upperSym = tokenSymbol.toUpperCase();

  // L1 — Mapping Exception صریح
  const override = UNDERLYING_SYMBOL_OVERRIDES[upperSym];
  if (override) {
    return { underlyingSymbol: override, underlyingName: extractCompanyName(tokenName) };
  }

  const companyName = extractCompanyName(tokenName);
  const candidate = tickerCandidate(tokenSymbol, provider);

  // L2 — نام شرکت شناخته‌شده (دقیق‌ترین)
  if (companyName) {
    const mapped = COMPANY_TICKER_MAP[companyName];
    if (mapped) {
      return { underlyingSymbol: mapped, underlyingName: companyName };
    }
  }

  // L2 — نام توکن شامل خود نامزد تیکر (مثلاً نام شامل «TSLA»)
  if (candidate && companyName && companyName.toUpperCase().includes(candidate)) {
    return { underlyingSymbol: candidate, underlyingName: companyName };
  }

  // L3 — نامزد ساختاری معتبر (پایین‌ترین اطمینان؛ فقط با نام شرکت)
  if (candidate && isPlausibleTicker(candidate, companyName) && companyName) {
    return { underlyingSymbol: candidate, underlyingName: companyName };
  }

  // بدون تشخیص قابل‌اعتماد → نماد پایه null (هرگز حدس خطرناک نمی‌زنیم)
  return { underlyingSymbol: null, underlyingName: companyName };
}

/** ============ نوع دارایی (فقط متادیتای صریح — بدون حدس) ============ */

export function resolveAssetType(tokenName: string): TokenizedAssetType {
  const n = tokenName.toLowerCase();
  if (/etf|etp/.test(n)) return 'ETF';
  if (/treasur|t-?bill|\bbond\b/.test(n)) return 'BOND';
  if (/index/.test(n)) return 'INDEX';
  if (/gold|silver|platinum|palladium|oil|copper|commodit/.test(n)) return 'COMMODITY';
  if (/preferred/.test(n)) return 'PREFERRED_STOCK';
  if (/stock|xstock/.test(n)) return 'STOCK';
  return 'OTHER';
}
