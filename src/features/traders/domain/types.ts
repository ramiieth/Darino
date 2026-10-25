/**
 * تایپ‌های دادهٔ خام هایپرلیکوئید که موتور کارنامه لازم دارد — مستقل از لایهٔ data
 * تا همین دامنه روی سرور (api/) هم بدون alias «@/» کامپایل شود. با HlFill سازگار است.
 */

export interface Fill {
  coin: string;
  px: string;
  sz: string;
  side: 'B' | 'A';
  time: number;
  startPosition: string;
  dir: string;
  closedPnl: string;
  fee?: string;
  tid?: number;
}

export type HlPortfolioWindow = { accountValueHistory: [number, string][]; pnlHistory: [number, string][]; vlm: string };
export type HlPortfolio = [string, HlPortfolioWindow][];

/** clearinghouseState — فقط فیلدهایی که خلاصهٔ پوزیشن لازم دارد */
export interface HlAccountState {
  marginSummary?: { accountValue?: string };
  assetPositions?: {
    position: {
      coin: string;
      szi: string;
      entryPx?: string | null;
      positionValue?: string;
      unrealizedPnl?: string;
      liquidationPx?: string | null;
      leverage?: { type?: string; value?: number };
    };
  }[];
}
