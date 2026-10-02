/** ============================================================
 * دارایی چندشبکه‌ای — مدل دامنه
 *
 * چهار مفهوم مستقل:
 *   شبکه (Network) · دارایی/توکن (Asset) · محل نگهداری (Holding) · عملیات (Operation)
 * موجودی هرگز ذخیره نمی‌شود؛ همیشه از روی عملیات‌های فعال محاسبه می‌شود
 * (ledger.ts). بنابراین ویرایش یک عملیات اثر قبلی را جایگزین می‌کند، نه انباشته.
 *
 * همه مقدارها رشتهٔ اعشاری دقیق‌اند (decimal.js) — هیچ float در محاسبات.
 * مقدار نامعلوم = null (هرگز صفر).
 * ============================================================ */

/* ---------------- شبکه ---------------- */

/** evm: شبکهٔ سازگار با اتریوم (آدرس 0x) · other: سایر (سولانا، بیت‌کوین، ترون…) */
export type NetworkKind = 'evm' | 'other';

export interface Network {
  /** شناسهٔ داخلی پایدار (مثل arbitrum) */
  id: string;
  /** نام فارسی */
  name: string;
  /** نام لاتین (برای جست‌وجو و تطبیق) */
  nameEn?: string;
  kind: NetworkKind;
  /** chainId برای شبکه‌های EVM */
  chainId: number | null;
  isTestnet: boolean;
  /** ریشهٔ explorer معتبر (https) — برای لینک tx/address */
  explorerUrl: string | null;
  /** مسیر لوگوی محلی (public/logos)، لوگوی دیفای‌لاما، یا null → fallback */
  logo: string | null;
  /** شناسهٔ دارایی native (مثل arbitrum:native) */
  nativeAssetId: string;
  /** منبع اطلاعات — catalog: تأییدشده در کد · user: واردشده توسط کاربر (از جمله انتخاب از فهرست دیفای‌لاما) */
  origin: 'catalog' | 'user';
  /** اگر از فهرست دیفای‌لاما انتخاب شده (شناسه/نام از آن‌جا، بقیه تأییدنشده) */
  source?: 'defillama' | 'manual';
  /** مرجع تأیید (برای catalog) */
  reference?: string;
  /** زمان ذخیره (رکورد کاربر — برای همگام‌سازی) */
  updatedAt?: number;
}

/* ---------------- دارایی / توکن ---------------- */

export interface Asset {
  /**
   * هویت یکتا:
   *   `${networkId}:native` ·  `${networkId}:${contract-lowercase}` ·
   *   `platform:arcus:${env}:collateral`
   * توکن‌های هم‌نام در شبکه‌های مختلف هرگز یکی نمی‌شوند.
   */
  id: string;
  symbol: string;
  /** نام فارسی */
  name: string;
  /** نام لاتین (برای جست‌وجو) */
  nameEn?: string;
  /** شبکه — برای دارایی داخل پلتفرم null */
  networkId: string | null;
  /** آدرس قرارداد (lowercase) — native/پلتفرم: null */
  contract: string | null;
  /** decimals تأییدشده — null یعنی تأیید نشده (اعتبارسنجی دقت انجام نمی‌شود) */
  decimals: number | null;
  isNative: boolean;
  /** دارایی داخلی پلتفرم (مثل وثیقهٔ Arcus) */
  platformId?: string;
  logo: string | null;
  /** شناسهٔ CoinGecko برای قیمت — بدون آن قیمت «نامشخص» است */
  coingeckoId?: string;
  origin: 'catalog' | 'user';
  reference?: string;
  /** زمان ذخیره (رکورد کاربر — برای همگام‌سازی) */
  updatedAt?: number;
}

/* ---------------- محل نگهداری ---------------- */

export type HoldingKind = 'wallet' | 'manual' | 'platform' | 'arcus';

export type ArcusEnv = 'mainnet' | 'testnet';

export interface Holding {
  id: string;
  kind: HoldingKind;
  /** نام دلخواه کاربر */
  label: string;
  /** کیف پول: آدرس عمومی (اختیاری) — هرگز کلید خصوصی */
  address?: string | null;
  /** کیف پول EVM: یک آدرس روی چند شبکه معتبر است؛ شبکه در سطح دارایی مشخص می‌شود */
  platformId?: string | null;
  /** فقط Arcus */
  arcus?: { env: ArcusEnv; address: string; accountIndex: number };
  note?: string;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number | null;
}

/* ---------------- عملیات ---------------- */

export type OperationKind =
  | 'swap'
  | 'bridge'
  | 'bridge_swap'
  | 'internal_transfer'
  | 'platform_deposit'
  | 'platform_withdrawal'
  | 'balance_adjustment';

/** وضعیت خود عملیات */
export type OperationStatus = 'pending' | 'completed' | 'failed';

/** روش تأیید — مستقل از وضعیت */
export type Verification =
  /** فقط طبق اعلام کاربر */
  | 'user_reported'
  /** کاربر خودش در explorer/سایت ارائه‌دهنده بررسی کرده */
  | 'user_checked_explorer'
  /** تطبیق‌شده با دادهٔ دریافتی از API رسمی (مثلاً Arcus) */
  | 'api_matched';

export type OperationSource = 'manual' | 'arcus_import';

export interface Leg {
  holdingId: string | null;
  assetId: string | null;
  /** رشتهٔ اعشاری مثبت یا null (نامعلوم) */
  amount: string | null;
}

export type FeeKind = 'bridge' | 'platform' | 'network' | 'bridge_and_platform' | 'other';

/**
 * نحوهٔ لحاظ‌شدن کارمزد:
 *  included_in_source   — داخل «مقدار خروجی از مبدا» است (اثر جدا ندارد)
 *  netted_in_received   — «مقدار دریافتی» خالص کارمزد است (دوباره کم نمی‌شود)
 *  separate             — جداگانه از موجودی دیگری پرداخت شده (اثر مستقل)
 */
export type FeeTreatment = 'included_in_source' | 'netted_in_received' | 'separate';

export interface Fee {
  id: string;
  kind: FeeKind;
  amount: string | null;
  assetId: string | null;
  /** فقط برای separate: از کدام محل پرداخت شده */
  holdingId: string | null;
  treatment: FeeTreatment;
  verification: Verification;
  /** ارزش دلاری کارمزد (برای ثبت هزینه در دفتر کل) — با منبع، یا null */
  usdValue?: string | null;
  usdValueSource?: string | null;
}

export interface ExternalRef {
  /** کلید یکتا برای جلوگیری از تکرار — مثل arcus:mainnet:0x..:0:transfer:dep-1 */
  key: string;
  system: 'arcus' | 'relay' | 'chain';
  linkedAt: number;
}

export interface HistoryEntry {
  at: number;
  action: 'created' | 'edited' | 'voided' | 'restored' | 'linked';
  summary: string;
}

export interface Operation {
  id: string;
  kind: OperationKind;
  status: OperationStatus;
  verification: Verification;
  source: OperationSource;
  /** زمان وقوع (epoch ms) — null یعنی نامعلوم */
  occurredAt: number | null;
  /** منطقهٔ زمانی IANA که کاربر زمان را با آن وارد کرد */
  timeZone: string | null;
  from: Leg;
  to: Leg;
  /** ارائه‌دهنده (relay / arcus / other) */
  providerId: string | null;
  /** نام آزاد برای «سایر» */
  providerName?: string | null;
  /** شناسهٔ عملیات نزد ارائه‌دهنده (مثلاً requestId در Relay) */
  providerRef: string | null;
  sourceTxHash: string | null;
  destTxHash: string | null;
  trackingUrl: string | null;
  fees: Fee[];
  /** ارزش دلاری عملیات — برای سند دفتر کل (سواپ/تبدیل). فقط همراه منبع و زمان */
  valuation?: { usdValue: string; source: string; at: number } | null;
  /** فقط تعدیل موجودی: «opening» یعنی کاربر صراحتاً خواسته در حسابداری به‌عنوان واریز ثبت شود */
  ledgerPosting?: 'none' | 'opening';
  note: string | null;
  externalRefs: ExternalRef[];
  createdAt: number;
  updatedAt: number;
  revision: number;
  history: HistoryEntry[];
  /** حذف نرم — اثر ندارد ولی قابل پیگیری می‌ماند */
  voidedAt: number | null;
  voidReason?: string | null;
}

/* ---------------- اثر روی موجودی ---------------- */

export type EffectRole = 'out' | 'in' | 'fee' | 'in_transit';

export interface Effect {
  operationId: string;
  holdingId: string;
  assetId: string;
  /** علامت‌دار (منفی = خروج) */
  delta: string;
  role: EffectRole;
}

/* ---------------- تنظیمات همگام (مبنای لات، سرمایهٔ سناریو…) ---------------- */

export interface PrefRecord<T = unknown> {
  id: string;
  revision: number;
  updatedAt: number;
  value: T;
}
