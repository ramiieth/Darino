/**
 * سرویس لوگوی سراسری — برای هر نماد بدون لوگو، از CoinGecko (۲۵۰ برتر + جستجو) پیدا می‌کند
 * با کش IndexedDB و صف محدود (جلوگیری از Rate Limit)
 */
import { create } from 'zustand';
import { searchCoin, fetchTopCoinLogos } from '@/shared/lib/coingecko';
import { TOKENIZED_COIN_MAP } from '@/features/simulation/data/tokenizedCoinMap';

/** لوگوهای توکنایز از seed تأییدشده (بدون درخواست شبکه در لود) */
export const TOKENIZED_LOGO_SEED: Record<string, string> = Object.fromEntries(
  Object.entries(TOKENIZED_COIN_MAP).map(([sym, m]) => [sym, m.img])
);
import { COIN_LOGO_FALLBACK } from '@/features/simulation/data/coinLogoFallback';
import { cacheBulkGetPrice, cachePutPrice } from '@/shared/lib/db';

interface LogoState {
  /** نماد → لوگو (از جستجو) */
  bySymbol: Record<string, string>;
  /** نماد‌های تلاش‌شده (جلوگیری از تکرار) */
  attempted: string[];
  /** لوگوهای ۲۵۰ سکه برتر */
  top250: Record<string, { img: string; id: string; name: string; marketCap?: number | null }>;
  loaded250: boolean;
  /** تغییر ۲۴ ساعته از CoinGecko (برای کریپتوها) */
  changes24h: Record<string, number>;
  setLogo: (symbol: string, img: string) => void;
  markAttempted: (symbol: string) => void;
  setTop250: (m: Record<string, { img: string; id: string; name: string; marketCap?: number | null }>) => void;
  /** نام کامل سکه (برای نمایش نام توکن) */
  names: Record<string, string>;
  setChanges24h: (c: Record<string, number>) => void;
}

export const useLogoStore = create<LogoState>((set) => ({
  bySymbol: {},
  attempted: [],
  top250: {},
  loaded250: false,
  names: {},
  changes24h: {},
  setChanges24h: (c) => set({ changes24h: c }),
  setLogo: (symbol, img) =>
    set((s) => ({ bySymbol: { ...s.bySymbol, [symbol]: img }, attempted: [...s.attempted, symbol] })),
  markAttempted: (symbol) =>
    set((s) => (s.attempted.includes(symbol) ? s : { attempted: [...s.attempted, symbol] })),
  setTop250: (m) => {
    const names: Record<string, string> = {};
    for (const [sym, v] of Object.entries(m)) names[sym] = v.name;
    set({ top250: m, names, loaded250: true });
  }
}));

let top250Promise: Promise<void> | null = null;

/** بارگذاری یک‌بار لوگوهای ۲۵۰ سکه برتر */
export function ensureTop250Logos(): Promise<void> {
  const store = useLogoStore.getState();
  if (store.loaded250) return Promise.resolve();
  if (!top250Promise) {
    top250Promise = (async () => {
      const m = await fetchTopCoinLogos();
      useLogoStore.getState().setTop250(m);
      // تغییر ۲۴ ساعته از کوئری زنده کوینگکو (از useCryptoPrices درج می‌شود)
      try {
        const { fetchCryptoPrices } = await import('@/shared/lib/coingecko');
        const ids = [...new Set(Object.values(m).map((v) => v.id))];
        const res = await fetchCryptoPrices(ids);
        useLogoStore.getState().setChanges24h(res.changes24h);
      } catch { /* خاموش */ }
    })()
      .catch(() => undefined)
      .finally(() => {
        top250Promise = null;
      });
  }
  return top250Promise;
}

const SEARCH_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
/** صف سراسری جستجوی لوگو — هر ۷ ثانیه یک نماد */
let searchChain: Promise<void> = Promise.resolve();

/**
 * پیدا کردن لوگو برای یک نماد (جستجوی CoinGecko با صف).
 * فقط یک بار در هر ۷ روز تلاش می‌شود؛ نتیجه (حتی ناموفق) کش می‌شود.
 */
export function ensureSymbolLogo(symbol: string): void {
  const store = useLogoStore.getState();
  const key = symbol.toUpperCase();
  if (store.bySymbol[key] || store.attempted.includes(key)) return;
  store.markAttempted(key);

  searchChain = searchChain.then(async () => {
    try {
      // کش IndexedDB؟
      const ck = `lg:${key}`;
      const rec = await cacheBulkGetPrice([ck]);
      const r = rec.get(ck);
      if (r && Date.now() - r.fetchedAt < SEARCH_CACHE_MS) {
        const url = r.price as unknown as string;
        if (url) useLogoStore.getState().setLogo(key, url);
        return;
      }
      const coin = await searchCoin(key);
      const url = coin?.large ?? null;
      if (url) {
        useLogoStore.getState().setLogo(key, url);
        try {
          await cachePutPrice(ck, { price: url as unknown as number, source: 'live', fetchedAt: Date.now() });
        } catch { /* خاموش */ }
      } else {
        // منفی → کش خالی (۷ روز تلاش نمی‌کند)
        try {
          await cachePutPrice(ck, { price: '' as unknown as number, source: 'na', fetchedAt: Date.now() });
        } catch { /* خاموش */ }
      }
    } catch {
      /* خاموش */
    }
  });
}

/** آدرس لوگوی یک نماد از همه منابع (سریع) یا null */
export function logoUrlForSymbol(symbol: string): string | null {
  const key = symbol.toUpperCase();
  const s = useLogoStore.getState();
  return s.bySymbol[key] ?? s.top250[key]?.img ?? COIN_LOGO_FALLBACK[key] ?? null;
}

/** نام کامل یک نماد (برای نمایش نام توکن) */
export function nameForSymbol(symbol: string): string | null {
  const key = symbol.toUpperCase();
  const s = useLogoStore.getState();
  return s.names[key] ?? null;
}
