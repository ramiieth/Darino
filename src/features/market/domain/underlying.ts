/** ============================================================
 * Underlying Matching — گروه‌بندی Instrumentها زیر دارایی پایه
 *
 *  - تطبیق از روی نگاشت نمادها به دارایی پایه (HIGH confidence)
 *  - NVDA / NVDAB / NVDAX / NVDAON → همه «NVIDIA»
 *  - جلوگیری از Over-grouping: NVDL (لوریج) هرگز NVIDIA نمی‌شود
 *  - نماد ناشناخته → بدون گروه (null)
 *
 * ⚠️ فقط برای UI/Search/Discovery — هیچ ترکیب مالی انجام نمی‌شود.
 * ============================================================ */
import type { MarketInstrument, UnderlyingGroup } from './types';

/** نگاشت نماد → دارایی پایه (فقط خانواده‌های شناخته‌شده) */
export const UNDERLYING_MAP: Record<string, { id: string; name: string; confidence: 'HIGH' | 'MEDIUM' | 'LOW' }> = {
  // NVIDIA خانواده
  NVDA: { id: 'nvda', name: 'NVIDIA', confidence: 'HIGH' },
  NVDAB: { id: 'nvda', name: 'NVIDIA', confidence: 'HIGH' },
  NVDAX: { id: 'nvda', name: 'NVIDIA', confidence: 'HIGH' },
  NVDAON: { id: 'nvda', name: 'NVIDIA', confidence: 'HIGH' },
  NVDAUSDT: { id: 'nvda', name: 'NVIDIA', confidence: 'HIGH' },
  // اپل خانواده
  AAPL: { id: 'aapl', name: 'Apple', confidence: 'HIGH' },
  AAPLX: { id: 'aapl', name: 'Apple', confidence: 'HIGH' },
  AAPLON: { id: 'aapl', name: 'Apple', confidence: 'HIGH' },
  // مایکروسافت
  MSFT: { id: 'msft', name: 'Microsoft', confidence: 'HIGH' },
  MSFTX: { id: 'msft', name: 'Microsoft', confidence: 'HIGH' },
  MSFTON: { id: 'msft', name: 'Microsoft', confidence: 'HIGH' },
  // تسلا
  TSLA: { id: 'tsla', name: 'Tesla', confidence: 'HIGH' },
  TSLAX: { id: 'tsla', name: 'Tesla', confidence: 'HIGH' },
  TSLAON: { id: 'tsla', name: 'Tesla', confidence: 'HIGH' },
  // آلفابت
  GOOGL: { id: 'googl', name: 'Alphabet', confidence: 'HIGH' },
  GOOGLX: { id: 'googl', name: 'Alphabet', confidence: 'HIGH' },
  GOOGLON: { id: 'googl', name: 'Alphabet', confidence: 'HIGH' },
  // آمازون
  AMZN: { id: 'amzn', name: 'Amazon', confidence: 'HIGH' },
  AMZNX: { id: 'amzn', name: 'Amazon', confidence: 'HIGH' },
  AMZNON: { id: 'amzn', name: 'Amazon', confidence: 'HIGH' },
  // متا
  META: { id: 'meta', name: 'Meta', confidence: 'HIGH' },
  METAX: { id: 'meta', name: 'Meta', confidence: 'HIGH' },
  METAON: { id: 'meta', name: 'Meta', confidence: 'HIGH' },
  // اس‌اند‌پی
  SPY: { id: 'spy', name: 'S&P 500', confidence: 'HIGH' },
  SPYX: { id: 'spy', name: 'S&P 500', confidence: 'HIGH' },
  SPYON: { id: 'spy', name: 'S&P 500', confidence: 'HIGH' },
  // نزدک
  QQQ: { id: 'qqq', name: 'Nasdaq 100', confidence: 'HIGH' },
  QQQX: { id: 'qqq', name: 'Nasdaq 100', confidence: 'HIGH' },
  QQQON: { id: 'qqq', name: 'Nasdaq 100', confidence: 'HIGH' }
};

/** یافتن گروه دارایی پایه برای یک نماد — یا null (نماد ناشناخته) */
export function underlyingFor(symbol: string): UnderlyingGroup | null {
  const hit = UNDERLYING_MAP[symbol.toUpperCase()];
  if (!hit) return null;
  return {
    underlyingId: hit.id,
    underlyingName: hit.name,
    matchConfidence: hit.confidence,
    instruments: []
  };
}

/** گروه‌بندی لیست Instrumentها زیر دارایی پایه (ترتیب ورودی حفظ می‌شود) */
export function groupByUnderlying(instruments: MarketInstrument[]): UnderlyingGroup[] {
  const groups = new Map<string, UnderlyingGroup>();
  for (const inst of instruments) {
    const g = underlyingFor(inst.symbol);
    if (!g) continue; // ناشناخته → بدون گروه
    const existing = groups.get(g.underlyingId);
    if (existing) {
      existing.instruments.push(inst);
    } else {
      g.instruments = [inst];
      groups.set(g.underlyingId, g);
    }
  }
  return [...groups.values()];
}
