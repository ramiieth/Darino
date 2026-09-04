/** ============================================================
 * Repositories — تایپ‌های مشترک لایه داده
 *
 * ⚠️ UI هرگز مستقیم Database/API را صدا نمی‌زند — فقط از Repositoryها.
 * ============================================================ */

/** شکل شبکه‌ای یک سند حسابداری (منطبق با Schema و Types اپ) */
export interface RemoteAccountingPayload {
  accounts: { key: string; nameFa: string; type: string; createdAt: number }[];
  entries: { id: number; date: number; createdAt: number; payload: unknown }[];
  lots: { id: number; asset: string; openedAt: number; payload: unknown }[];
  events: { id: number; at: number; payload: unknown }[];
}

/** پاسخ GET /api/accounting */
export interface RemoteAccountingResponse extends RemoteAccountingPayload {
  configured: boolean;
}

/** یک دارایی پورتفولیو (Cost Basis — قیمت جاری از Market Data می‌آید) */
export interface PortfolioAsset {
  id?: number;
  assetType: 'crypto' | 'tokenized' | 'tradfi' | 'cash';
  assetId: string;
  quantity: number;
  averageCost: number;
  purchaseDate?: number | null;
  currency?: string;
  note?: string | null;
  createdAt: number;
  updatedAt: number;
}

/** اسنپ‌شات ارزش خالص (فقط تاریخچه/نمودار) */
export interface DashboardSnapshot {
  id?: number;
  timestamp: number;
  totalValue: number;
  totalCost?: number | null;
  profitLoss?: number | null;
  allocationSnapshot?: Record<string, unknown> | null;
  /** نرخ دلار استفاده‌شده در همان لحظه — Historical FX */
  fxRateUsed?: number | null;
  createdAt?: number;
}
