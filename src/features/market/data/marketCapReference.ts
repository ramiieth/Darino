/** ============================================================
 * Market Cap Reference — کاتالوگ مرجع تقریبی (فقط برای برچسب «≈ مرجع»)
 *
 * ⚠️ این مقادیر تقریبی هستند و همیشه با برچسب «≈» و «مرجع» نمایش داده
 * می‌شوند؛ هرگز به‌عنوان داده زنده/دقیق معرفی نمی‌شوند. اولویت همیشه
 * با داده زنده Provider است (در صورت موجود بودن).
 * شاخص‌ها و اوراق → N/A (داده واقعی نداریم).
 * ============================================================ */

/** مارکت‌کپ مرجع تقریبی (دلار) — سهام/ETF/صندوق‌های کامودیتی */
export const REFERENCE_MARKET_CAPS: Record<string, number> = {
  // سهام بزرگ آمریکا
  NVDA: 4.8e12,
  AAPL: 3.4e12,
  MSFT: 3.3e12,
  GOOGL: 2.5e12,
  AMZN: 2.2e12,
  META: 1.5e12,
  TSLA: 1.0e12,
  JPM: 6.5e11,
  XOM: 5.0e11,
  // ETF
  SPY: 6.3e11,
  QQQ: 3.1e11,
  // صندوق‌های کامودیتی
  GLD: 8.0e10,
  SLV: 1.5e10,
  USO: 1.2e9,
  UNG: 3.0e9,
  DBA: 2.0e9
};

/** آیا نماد مارکت‌کپ مرجع دارد؟ */
export function hasReferenceMarketCap(symbol: string): boolean {
  return symbol.toUpperCase() in REFERENCE_MARKET_CAPS;
}

/** مارکت‌کپ مرجع یک نماد — یا null (N/A) */
export function referenceMarketCap(symbol: string): number | null {
  return REFERENCE_MARKET_CAPS[symbol.toUpperCase()] ?? null;
}
