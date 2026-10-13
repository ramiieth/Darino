/** کارت فشردهٔ یک کالای دیجی‌کالا — خروجی سرور (/api/integrations?op=dk-search) */
export interface DkCard {
  id: number;
  title: string;
  brand: string | null;
  category: string | null;
  image: string | null;
  url: string;
  /** قیمت فروش به تومان (API دیجی‌کالا ریال می‌دهد) */
  priceToman: number | null;
  /** قیمت پیش از تخفیف (تومان) */
  priceBeforeToman: number | null;
  discountPercent: number;
  /** امتیاز ۰ تا ۵ — اگر رأی کافی نباشد null */
  stars: number | null;
  ratingCount: number;
  inStock: boolean;
  seller: string | null;
  sellerStars: number | null;
  incredible: boolean;
}

export interface DkSearchResult {
  query: string;
  page: number;
  totalPages: number;
  totalItems: number;
  items: DkCard[];
  fetchedAt: number;
}

export interface DkOffer {
  seller: string;
  sellerStars: number | null;
  official: boolean;
  trusted: boolean;
  priceToman: number;
  discountPercent: number;
  warranty: string | null;
  color: string | null;
}

export interface DkSpecGroup {
  title: string;
  rows: { title: string; value: string }[];
}

export interface DkComment {
  body: string;
  rate: number | null;
  date: string;
  isBuyer: boolean;
}

export interface DkProduct extends DkCard {
  /** درصد خریدارانی که خرید را پیشنهاد کرده‌اند */
  recommendPercent: number | null;
  commentsCount: number;
  overview: string | null;
  advantages: string[];
  disadvantages: string[];
  offers: DkOffer[];
  specs: DkSpecGroup[];
  comments: DkComment[];
  fetchedAt: number;
}

export type DkSort = 'relevant' | 'cheapest' | 'expensive' | 'bestselling' | 'buyers' | 'newest';

export const DK_SORT_IDS: Record<DkSort, number> = {
  relevant: 22,
  cheapest: 20,
  expensive: 21,
  bestselling: 7,
  buyers: 27,
  newest: 1
};
