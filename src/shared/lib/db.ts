/**
 * لایه داده محلی (Offline-First) — Dexie.js روی IndexedDB
 * با فالبک خودکار به حافظه داخلی وقتی IndexedDB در دسترس نیست.
 */
import Dexie, { type Table } from 'dexie';
import type { PriceQuote } from '@/shared/types';
import type { Vehicle } from '@/features/vehicle/domain/types';
import type { VehicleSnapshot } from '@/features/vehicle/domain/types';
import type { RealAsset } from '@/features/realestate/domain/types';
import type { RealEstateSnapshot } from '@/features/realestate/domain/types';

/** رکورد کش قیمت در IndexedDB */
export interface PriceCacheRecord extends PriceQuote {
  /** کلید: مثلاً `coingecko:ethereum` یا `av:SPY` */
  key: string;
}

/** فراداده دارایی (لوگو و شناسه کوین) برای کش IndexedDB */
export interface AssetMetaRecord {
  /** کلید: نماد دارایی (مثل COHRON یا AAPL) */
  key: string;
  /** شناسه کوین CoinGecko (برای رمزارز و توکن‌ایز) */
  coinId?: string;
  /** نام رسمی انگلیسی */
  nameEn?: string;
  /** آدرس لوگو */
  logoUrl?: string;
  updatedAt: number;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

/** نرخ ارز (دلار→تومان) با تاریخچه ۲۴ ساعت — قابل آپدیت دستی توسط ادمین */
export interface FxRateRecord {
  id: 'usd-irr';
  rate: number;
  updatedAt: number;
  /** تاریخچه ۲۴ ساعت گذشته (prune روی هر insert) */
  history: { t: number; rate: number }[];
}

/** دارایی نشان‌شده (Watchlist) */
export interface WatchItemRecord {
  symbol: string;
  addedAt: number;
}

class AppDatabase extends Dexie {
  priceCache!: Table<PriceCacheRecord, string>;
  assetMeta!: Table<AssetMetaRecord, string>;
  settings!: Table<SettingRecord, string>;
  fxRates!: Table<FxRateRecord, string>;
  watchlist!: Table<WatchItemRecord, string>;

  constructor() {
    super('portfolio-simulator-db');
    this.version(1).stores({
      priceCache: 'key, fetchedAt',
      settings: 'key'
    });
    this.version(2).stores({
      priceCache: 'key, fetchedAt',
      assetMeta: 'key, updatedAt',
      settings: 'key'
    });
    this.version(3).stores({
      priceCache: 'key, fetchedAt',
      assetMeta: 'key, updatedAt',
      settings: 'key',
      fxRates: 'id, updatedAt',
      watchlist: 'symbol, addedAt'
    });
    this.version(4).stores({
      priceCache: 'key, fetchedAt',
      assetMeta: 'key, updatedAt',
      settings: 'key',
      fxRates: 'id, updatedAt',
      watchlist: 'symbol, addedAt',
      accAccounts: 'key',
      accEntries: '++id, date, createdAt',
      accLots: '++id, asset, openedAt',
      accEvents: '++id, at'
    });
    this.version(5).stores({
      priceCache: 'key, fetchedAt',
      assetMeta: 'key, updatedAt',
      settings: 'key',
      fxRates: 'id, updatedAt',
      watchlist: 'symbol, addedAt',
      accAccounts: 'key',
      accEntries: '++id, date, createdAt',
      accLots: '++id, asset, openedAt',
      accEvents: '++id, at',
      vehicles: 'id',
      vehicleSnapshots: 'id, dateTs'
    });
    this.version(6).stores({
      priceCache: 'key, fetchedAt',
      assetMeta: 'key, updatedAt',
      settings: 'key',
      fxRates: 'id, updatedAt',
      watchlist: 'symbol, addedAt',
      accAccounts: 'key',
      accEntries: '++id, date, createdAt',
      accLots: '++id, asset, openedAt',
      accEvents: '++id, at',
      vehicles: 'id',
      vehicleSnapshots: 'id, dateTs',
      realAssets: 'id, neighborhoodId',
      realEstateSnapshots: 'id, dateTs'
    });
    this.version(7).stores({
      priceCache: 'key, fetchedAt',
      assetMeta: 'key, updatedAt',
      settings: 'key',
      fxRates: 'id, updatedAt',
      watchlist: 'symbol, addedAt',
      accAccounts: 'key',
      accEntries: '++id, date, createdAt',
      accLots: '++id, asset, openedAt',
      accEvents: '++id, at',
      vehicles: 'id',
      vehicleSnapshots: 'id, dateTs',
      realAssets: 'id, neighborhoodId',
      realEstateSnapshots: 'id, dateTs'
    });
    // v8: جداول RWA/بازطراحی (market*) حذف و جداول Registry توکنایز اضافه شدند
    this.version(8).stores({
      priceCache: 'key, fetchedAt',
      assetMeta: 'key, updatedAt',
      settings: 'key',
      fxRates: 'id, updatedAt',
      watchlist: 'symbol, addedAt',
      accAccounts: 'key',
      accEntries: '++id, date, createdAt',
      accLots: '++id, asset, openedAt',
      accEvents: '++id, at',
      vehicles: 'id',
      vehicleSnapshots: 'id, dateTs',
      realAssets: 'id, neighborhoodId',
      realEstateSnapshots: 'id, dateTs',
      // Tokenized Asset Registry — هویت/فراداده (Market Discovery فقط)
      tokenizedAssetRegistry: 'key, provider, status, underlyingSymbol, assetType, sourceRank, updatedAt',
      tokenizedAssetSyncRuns: '++id, provider, sourceCategory, startedAt'
    });
    // v9: جداول محلی Portfolio/Dashboard — آفلاین (Neon = SSOT وقتی متصل است)
    this.version(9).stores({
      priceCache: 'key, fetchedAt',
      assetMeta: 'key, updatedAt',
      settings: 'key',
      fxRates: 'id, updatedAt',
      watchlist: 'symbol, addedAt',
      accAccounts: 'key',
      accEntries: '++id, date, createdAt',
      accLots: '++id, asset, openedAt',
      accEvents: '++id, at',
      vehicles: 'id',
      vehicleSnapshots: 'id, dateTs',
      realAssets: 'id, neighborhoodId',
      realEstateSnapshots: 'id, dateTs',
      tokenizedAssetRegistry: 'key, provider, status, underlyingSymbol, assetType, sourceRank, updatedAt',
      tokenizedAssetSyncRuns: '++id, provider, sourceCategory, startedAt',
      portfolioAssets: '++id, assetType, assetId, updatedAt',
      dashboardSnapshots: '++id, timestamp, createdAt'
    });
  }
}

let dbInstance: AppDatabase | null = null;
let memoryCache = new Map<string, PriceCacheRecord>();
let memoryMeta = new Map<string, AssetMetaRecord>();
let memorySettings = new Map<string, unknown>();

export async function getDb(): Promise<AppDatabase | null> {
  if (dbInstance) return dbInstance;
  try {
    if (typeof indexedDB === 'undefined') return null;
    const db = new AppDatabase();
    await db.open();
    dbInstance = db;
  } catch {
    dbInstance = null; // IndexedDB مسدود است → فالبک حافظه
  }
  return dbInstance;
}

/* ---------------- قیمت‌ها ---------------- */

export async function cacheGetPrice(key: string): Promise<PriceCacheRecord | null> {
  try {
    const db = await getDb();
    if (db) return (await db.priceCache.get(key)) ?? null;
  } catch {
    /* ادامه با فالبک */
  }
  return memoryCache.get(key) ?? null;
}

export async function cachePutPrice(key: string, quote: PriceQuote): Promise<void> {
  const record: PriceCacheRecord = { key, ...quote };
  memoryCache.set(key, record);
  try {
    const db = await getDb();
    if (db) await db.priceCache.put(record);
  } catch {
    /* فقط حافظه */
  }
}

/** حذف کلیدهای کش (برای پاک‌سازی ماژول‌های حذف‌شده) */
export async function cacheDeleteKeys(keys: string[]): Promise<void> {
  keys.forEach((k) => memoryCache.delete(k));
  try {
    const db = await getDb();
    if (db) await db.priceCache.bulkDelete(keys);
  } catch {
    /* خاموش */
  }
}

export async function cacheBulkGetPrice(keys: string[]): Promise<Map<string, PriceCacheRecord>> {
  const out = new Map<string, PriceCacheRecord>();
  try {
    const db = await getDb();
    if (db) {
      const rows = await db.priceCache.bulkGet(keys);
      rows.forEach((r, i) => {
        if (r) out.set(r.key, r);
      });
      return out;
    }
  } catch {
    /* فالبک */
  }
  keys.forEach((k) => {
    const r = memoryCache.get(k);
    if (r) out.set(k, r);
  });
  return out;
}

export async function cacheClearPrices(): Promise<void> {
  memoryCache.clear();
  try {
    const db = await getDb();
    if (db) await db.priceCache.clear();
  } catch {
    /* خاموش */
  }
}

/* ---------------- فراداده دارایی (لوگو/شناسه) ---------------- */

export async function metaGet(key: string): Promise<AssetMetaRecord | null> {
  try {
    const db = await getDb();
    if (db) return (await db.assetMeta.get(key)) ?? null;
  } catch {
    /* ادامه */
  }
  return memoryMeta.get(key) ?? null;
}

export async function metaBulkGet(keys: string[]): Promise<Map<string, AssetMetaRecord>> {
  const out = new Map<string, AssetMetaRecord>();
  try {
    const db = await getDb();
    if (db) {
      const rows = await db.assetMeta.bulkGet(keys);
      rows.forEach((r) => {
        if (r) out.set(r.key, r);
      });
      return out;
    }
  } catch {
    /* فالبک */
  }
  keys.forEach((k) => {
    const r = memoryMeta.get(k);
    if (r) out.set(k, r);
  });
  return out;
}

export async function metaPut(rec: AssetMetaRecord): Promise<void> {
  memoryMeta.set(rec.key, rec);
  try {
    const db = await getDb();
    if (db) await db.assetMeta.put(rec);
  } catch {
    /* فقط حافظه */
  }
}

export async function metaBulkPut(recs: AssetMetaRecord[]): Promise<void> {
  recs.forEach((r) => memoryMeta.set(r.key, r));
  try {
    const db = await getDb();
    if (db) await db.assetMeta.bulkPut(recs);
  } catch {
    /* فقط حافظه */
  }
}

/* ---------------- تنظیمات ---------------- */

export async function settingGet<T>(key: string, fallback: T): Promise<T> {
  try {
    const db = await getDb();
    if (db) {
      const row = await db.settings.get(key);
      if (row) return row.value as T;
    } else {
      const v = memorySettings.get(key);
      if (v !== undefined) return v as T;
    }
  } catch {
    /* خاموش */
  }
  return fallback;
}

export async function settingSet(key: string, value: unknown): Promise<void> {
  memorySettings.set(key, value);
  try {
    const db = await getDb();
    if (db) await db.settings.put({ key, value });
  } catch {
    /* خاموش */
  }
}

/* ---------------- نرخ ارز (fx_rates) ---------------- */

let memoryFx: FxRateRecord | null = null;

export async function fxGet(): Promise<FxRateRecord | null> {
  try {
    const db = await getDb();
    if (db) return (await db.fxRates.get('usd-irr')) ?? null;
  } catch {
    /* فالبک */
  }
  return memoryFx;
}

export async function fxPut(rec: FxRateRecord): Promise<void> {
  memoryFx = rec;
  try {
    const db = await getDb();
    if (db) await db.fxRates.put(rec);
  } catch {
    /* فقط حافظه */
  }
}

/* ---------------- Watchlist ---------------- */

let memoryWatch = new Map<string, WatchItemRecord>();

export async function watchAll(): Promise<WatchItemRecord[]> {
  try {
    const db = await getDb();
    if (db) return await db.watchlist.toArray();
  } catch {
    /* فالبک */
  }
  return [...memoryWatch.values()];
}

export async function watchPut(item: WatchItemRecord): Promise<void> {
  memoryWatch.set(item.symbol, item);
  try {
    const db = await getDb();
    if (db) await db.watchlist.put(item);
  } catch {
    /* فقط حافظه */
  }
}

export async function watchDelete(symbol: string): Promise<void> {
  memoryWatch.delete(symbol);
  try {
    const db = await getDb();
    if (db) await db.watchlist.delete(symbol);
  } catch {
    /* فقط حافظه */
  }
}
