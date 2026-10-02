/** ============================================================
 * موتور دفتر مقداری (Quantity Ledger) — توابع خالص
 *
 * قواعد (جلوگیری از دوباره‌شماری):
 *  • موجودی = Σ اثر عملیات‌های «فعال». هیچ موجودی ذخیره‌شده‌ای روی آن انباشته نمی‌شود؛
 *    پس ویرایش، اثر قبلی را جایگزین می‌کند و حذف نرم (void) اثر را برمی‌دارد.
 *  • completed: خروج از مبدا + ورود به مقصد + کارمزدهای «جداگانه».
 *  • pending:   خروج از مبدا + «در حال انتقال» (جدا از موجودی‌ها) — مقصد اعتبار نمی‌گیرد.
 *  • failed:    هیچ اثر، جز کارمزد شبکه‌ای که جداگانه پرداخت شده (gas حتی در شکست مصرف می‌شود).
 *  • کارمزد included_in_source / netted_in_received فقط اطلاعاتی است — دوباره کم نمی‌شود.
 *  • مقدار نامعلوم (null) هیچ اثری ندارد و عملیات «ناقص» علامت می‌خورد (هرگز صفر فرض نمی‌شود).
 *  • انتقال داخلی/سپرده/برداشت فقط جابه‌جایی محل است؛ درآمد یا سرمایهٔ جدید نیست.
 *  • اختلاف تعداد دو توکن متفاوت خودکار «کارمزد» یا «زیان» حساب نمی‌شود.
 * ============================================================ */
import { add, cmp, isZero, neg, parsePositiveAmount } from './decimal';
import type {
  Asset,
  Effect,
  Fee,
  Holding,
  HoldingKind,
  Operation,
  OperationKind,
  Verification
} from './types';

/* ---------------- فرادادهٔ نوع عملیات ---------------- */

export interface KindMeta {
  kind: OperationKind;
  label: string;
  short: string;
  description: string;
  /** کدام سمت‌ها لازم است */
  legs: 'both' | 'one';
  /** محدودیت نوع محل نگهداری */
  fromKinds?: HoldingKind[];
  toKinds?: HoldingKind[];
  network: 'same' | 'different' | 'any';
  asset: 'same' | 'different' | 'any';
  /** آیا ارائه‌دهنده معنی دارد */
  provider: boolean;
}

export const KIND_META: Record<OperationKind, KindMeta> = {
  swap: {
    kind: 'swap',
    label: 'سواپ (تبدیل توکن در یک شبکه)',
    short: 'سواپ',
    description: 'تبدیل یک دارایی به دارایی دیگر روی همان شبکه',
    legs: 'both',
    network: 'same',
    asset: 'different',
    provider: true
  },
  bridge: {
    kind: 'bridge',
    label: 'بریج (انتقال بین شبکه‌ها)',
    short: 'بریج',
    description: 'انتقال یک دارایی از یک شبکه به شبکهٔ دیگر',
    legs: 'both',
    network: 'different',
    asset: 'any',
    provider: true
  },
  bridge_swap: {
    kind: 'bridge_swap',
    label: 'بریج همراه با تبدیل',
    short: 'بریج و تبدیل',
    description: 'تغییر هم‌زمان شبکه و توکن',
    legs: 'both',
    network: 'different',
    asset: 'different',
    provider: true
  },
  internal_transfer: {
    kind: 'internal_transfer',
    label: 'انتقال بین حساب‌های خودم',
    short: 'انتقال داخلی',
    description: 'جابه‌جایی یک دارایی بین دو کیف پول یا حساب متعلق به خودتان',
    legs: 'both',
    network: 'same',
    asset: 'same',
    provider: false
  },
  platform_deposit: {
    kind: 'platform_deposit',
    label: 'سپرده‌گذاری در پلتفرم',
    short: 'سپرده',
    description: 'انتقال از کیف پول یا حساب به حساب یک پلتفرم (مثل آرکوس)',
    legs: 'both',
    fromKinds: ['wallet', 'manual'],
    toKinds: ['platform', 'arcus'],
    network: 'any',
    asset: 'any',
    provider: true
  },
  platform_withdrawal: {
    kind: 'platform_withdrawal',
    label: 'برداشت از پلتفرم',
    short: 'برداشت',
    description: 'انتقال از حساب پلتفرم به کیف پول یا حساب مقصد',
    legs: 'both',
    fromKinds: ['platform', 'arcus'],
    toKinds: ['wallet', 'manual'],
    network: 'any',
    asset: 'any',
    provider: true
  },
  balance_adjustment: {
    kind: 'balance_adjustment',
    label: 'ثبت/تعدیل موجودی',
    short: 'تعدیل موجودی',
    description: 'ثبت موجودی اولیه یا اصلاح موجودی یک محل (فقط یک سمت)',
    legs: 'one',
    network: 'any',
    asset: 'any',
    provider: false
  }
};

export const OPERATION_KINDS = Object.keys(KIND_META) as OperationKind[];

export const STATUS_LABEL: Record<Operation['status'], string> = {
  pending: 'در جریان',
  completed: 'تکمیل‌شده',
  failed: 'ناموفق'
};

export const VERIFICATION_LABEL: Record<Verification, string> = {
  user_reported: 'طبق اعلام شما',
  user_checked_explorer: 'بررسی‌شده توسط شما در کاوشگر بلاکچین',
  api_matched: 'تطبیق‌شده با دادهٔ رسمی پلتفرم'
};

/* ---------------- اعتبارسنجی ---------------- */

export interface LedgerContext {
  assets: Map<string, Asset>;
  holdings: Map<string, Holding>;
}

export interface ValidationResult {
  errors: Record<string, string>;
  warnings: string[];
}

function checkAmount(
  field: string,
  amount: string | null,
  asset: Asset | undefined,
  errors: Record<string, string>,
  required: boolean
): void {
  if (amount === null || amount === '') {
    if (required) errors[field] = 'مقدار را وارد کنید';
    return;
  }
  const r = parsePositiveAmount(amount, asset?.decimals ?? null);
  if (!r.ok) errors[field] = r.error;
}

/**
 * اعتبارسنجی ساختاری قبل از ذخیره.
 * مقدار نامعلوم فقط برای عملیات pending/failed مجاز است؛ عملیات completed
 * بدون مقدار، اثرش «نامشخص» می‌ماند — پس با هشدار مجاز است، ولی صفر هرگز.
 */
export function validateOperation(op: Operation, ctx: LedgerContext): ValidationResult {
  const errors: Record<string, string> = {};
  const warnings: string[] = [];
  const meta = KIND_META[op.kind];
  const fromAsset = op.from.assetId ? ctx.assets.get(op.from.assetId) : undefined;
  const toAsset = op.to.assetId ? ctx.assets.get(op.to.assetId) : undefined;
  const fromHolding = op.from.holdingId ? ctx.holdings.get(op.from.holdingId) : undefined;
  const toHolding = op.to.holdingId ? ctx.holdings.get(op.to.holdingId) : undefined;

  if (meta.legs === 'one') {
    const hasFrom = !!op.from.holdingId || !!op.from.assetId;
    const hasTo = !!op.to.holdingId || !!op.to.assetId;
    if (hasFrom === hasTo) errors.direction = 'فقط یکی از «افزایش» یا «کاهش» را مشخص کنید';
    const leg = hasTo ? op.to : op.from;
    const prefix = hasTo ? 'to' : 'from';
    if (!leg.holdingId) errors[`${prefix}.holdingId`] = 'محل نگهداری را انتخاب کنید';
    if (!leg.assetId) errors[`${prefix}.assetId`] = 'دارایی را انتخاب کنید';
    checkAmount(`${prefix}.amount`, leg.amount, hasTo ? toAsset : fromAsset, errors, true);
  } else {
    if (!op.from.holdingId) errors['from.holdingId'] = 'محل مبدا را انتخاب کنید';
    if (!op.to.holdingId) errors['to.holdingId'] = 'محل مقصد را انتخاب کنید';
    if (!op.from.assetId) errors['from.assetId'] = 'دارایی مبدا را انتخاب کنید';
    if (!op.to.assetId) errors['to.assetId'] = 'دارایی مقصد را انتخاب کنید';
    const requireAmounts = op.status === 'completed';
    checkAmount('from.amount', op.from.amount, fromAsset, errors, false);
    checkAmount('to.amount', op.to.amount, toAsset, errors, false);
    if (requireAmounts && (op.from.amount === null || op.to.amount === null)) {
      warnings.push('یکی از مقدارها نامعلوم است؛ اثر آن سمت روی موجودی «نامشخص» می‌ماند (صفر فرض نمی‌شود).');
    }

    if (meta.fromKinds && fromHolding && !meta.fromKinds.includes(fromHolding.kind)) {
      errors['from.holdingId'] =
        op.kind === 'platform_withdrawal' ? 'مبدا برداشت باید حساب پلتفرم باشد' : 'مبدا باید کیف پول یا حساب دستی باشد';
    }
    if (meta.toKinds && toHolding && !meta.toKinds.includes(toHolding.kind)) {
      errors['to.holdingId'] =
        op.kind === 'platform_deposit' ? 'مقصد سپرده باید حساب پلتفرم باشد' : 'مقصد باید کیف پول یا حساب دستی باشد';
    }

    if (fromAsset && toAsset) {
      const sameNet = fromAsset.networkId === toAsset.networkId;
      if (meta.network === 'same' && !sameNet) {
        errors['to.assetId'] =
          op.kind === 'swap'
            ? 'در سواپ هر دو دارایی باید روی یک شبکه باشند؛ برای تغییر شبکه «بریج» را انتخاب کنید'
            : 'در انتقال داخلی دارایی و شبکه باید یکسان باشد';
      }
      if (meta.network === 'different' && sameNet) {
        errors['to.assetId'] = 'در بریج شبکهٔ مبدا و مقصد باید متفاوت باشد';
      }
      if (meta.asset === 'same' && fromAsset.id !== toAsset.id) {
        errors['to.assetId'] = 'در انتقال داخلی دارایی مبدا و مقصد باید یکی باشد';
      }
      if (meta.asset === 'different' && fromAsset.id === toAsset.id) {
        errors['to.assetId'] = 'دارایی مقصد باید با مبدا متفاوت باشد';
      }
      if (op.kind === 'bridge' && fromAsset.symbol !== toAsset.symbol) {
        warnings.push('نماد دو سمت متفاوت است؛ اگر توکن هم تغییر کرده، «بریج همراه با تبدیل» دقیق‌تر است.');
      }
    }
    if (op.kind === 'internal_transfer' && op.from.holdingId && op.from.holdingId === op.to.holdingId) {
      errors['to.holdingId'] = 'مبدا و مقصد انتقال داخلی باید متفاوت باشند';
    }
  }

  op.fees.forEach((f, i) => {
    const fa = f.assetId ? ctx.assets.get(f.assetId) : undefined;
    if (f.amount !== null && f.amount !== '') {
      const r = parsePositiveAmount(f.amount, fa?.decimals ?? null);
      if (!r.ok) errors[`fees.${i}.amount`] = r.error;
    }
    if (f.amount && !f.assetId) errors[`fees.${i}.assetId`] = 'دارایی پرداخت کارمزد را انتخاب کنید';
    if (f.treatment === 'separate' && f.amount && !f.holdingId) {
      errors[`fees.${i}.holdingId`] = 'محل پرداخت کارمزد جداگانه را انتخاب کنید';
    }
    if (f.treatment === 'netted_in_received' && f.assetId && op.to.assetId && f.assetId !== op.to.assetId) {
      warnings.push('کارمزدی که «داخل مقدار دریافتی» است معمولاً به همان دارایی مقصد است؛ دارایی کارمزد را بررسی کنید.');
    }
    if (f.treatment === 'included_in_source' && f.assetId && op.from.assetId && f.assetId !== op.from.assetId) {
      warnings.push('کارمزدی که «داخل مقدار خروجی» است معمولاً به همان دارایی مبدا است؛ دارایی کارمزد را بررسی کنید.');
    }
  });

  return { errors, warnings };
}

/* ---------------- اثر روی موجودی ---------------- */

function separateFeeEffects(op: Operation, fees: Fee[]): Effect[] {
  return fees
    .filter((f) => f.treatment === 'separate' && f.amount && f.assetId && f.holdingId)
    .map((f) => ({
      operationId: op.id,
      holdingId: f.holdingId!,
      assetId: f.assetId!,
      delta: neg(f.amount!),
      role: 'fee' as const
    }));
}

/** اثر یک عملیات روی موجودی‌ها (عملیات باطل‌شده اثری ندارد) */
export function computeEffects(op: Operation): Effect[] {
  if (op.voidedAt) return [];
  const out: Effect[] = [];
  const { from, to } = op;

  if (op.status === 'failed') {
    // فقط gas جداگانه — تراکنش ناموفق هم کارمزد شبکه مصرف می‌کند
    return separateFeeEffects(
      op,
      op.fees.filter((f) => f.kind === 'network')
    );
  }

  if (from.holdingId && from.assetId && from.amount) {
    out.push({ operationId: op.id, holdingId: from.holdingId, assetId: from.assetId, delta: neg(from.amount), role: 'out' });
  }

  if (op.status === 'completed') {
    if (to.holdingId && to.assetId && to.amount) {
      out.push({ operationId: op.id, holdingId: to.holdingId, assetId: to.assetId, delta: to.amount, role: 'in' });
    }
  } else if (op.status === 'pending') {
    // در حال انتقال: مقدار خروجی تا زمان تکمیل، جدا از هر دو موجودی نگه داشته می‌شود
    if (from.holdingId && from.assetId && from.amount && to.holdingId) {
      out.push({ operationId: op.id, holdingId: to.holdingId, assetId: from.assetId, delta: from.amount, role: 'in_transit' });
    }
  }

  out.push(...separateFeeEffects(op, op.fees));
  return out;
}

/** آیا اثر عملیات به‌خاطر مقدار نامعلوم ناقص است؟ */
export function isIncomplete(op: Operation): boolean {
  if (op.voidedAt || op.status === 'failed') return false;
  const meta = KIND_META[op.kind];
  if (meta.legs === 'one') return false;
  if (op.status === 'pending') return op.from.amount === null;
  return op.from.amount === null || op.to.amount === null || op.fees.some((f) => f.treatment === 'separate' && f.amount === null);
}

export interface BalanceRow {
  holdingId: string;
  assetId: string;
  quantity: string;
  /** حداقل یک عملیات مرتبط مقدار نامعلوم دارد */
  incomplete: boolean;
  operationIds: string[];
}

export interface InTransitRow {
  operationId: string;
  /** مقصد مورد انتظار */
  holdingId: string;
  assetId: string;
  quantity: string;
}

export interface LedgerState {
  balances: BalanceRow[];
  inTransit: InTransitRow[];
}

export const balanceKey = (holdingId: string, assetId: string) => `${holdingId}|${assetId}`;

/** محاسبهٔ کامل موجودی‌ها از صفر (بدون هیچ وضعیت انباشته) */
export function computeLedger(ops: Operation[]): LedgerState {
  const map = new Map<string, BalanceRow>();
  const inTransit: InTransitRow[] = [];

  for (const op of ops) {
    const incomplete = isIncomplete(op);
    for (const e of computeEffects(op)) {
      if (e.role === 'in_transit') {
        inTransit.push({ operationId: e.operationId, holdingId: e.holdingId, assetId: e.assetId, quantity: e.delta });
        continue;
      }
      const k = balanceKey(e.holdingId, e.assetId);
      const row = map.get(k) ?? { holdingId: e.holdingId, assetId: e.assetId, quantity: '0', incomplete: false, operationIds: [] };
      row.quantity = add(row.quantity, e.delta);
      if (!row.operationIds.includes(op.id)) row.operationIds.push(op.id);
      row.incomplete = row.incomplete || incomplete;
      map.set(k, row);
    }
    // سمت‌هایی که مقدار نامعلوم دارند هم باید ردیف «ناقص» را نشان دهند
    if (incomplete) {
      for (const leg of [op.from, op.to]) {
        if (!leg.holdingId || !leg.assetId) continue;
        const k = balanceKey(leg.holdingId, leg.assetId);
        const row = map.get(k) ?? { holdingId: leg.holdingId, assetId: leg.assetId, quantity: '0', incomplete: true, operationIds: [] };
        row.incomplete = true;
        if (!row.operationIds.includes(op.id)) row.operationIds.push(op.id);
        map.set(k, row);
      }
    }
  }

  const balances = [...map.values()].filter((r) => !isZero(r.quantity) || r.incomplete);
  return { balances, inTransit };
}

/** موجودی فعلی یک (محل، دارایی) — با حذف یک عملیات (برای حالت ویرایش) */
export function availableBalance(ops: Operation[], holdingId: string, assetId: string, excludeOpId?: string): string {
  let q = '0';
  for (const op of ops) {
    if (op.id === excludeOpId) continue;
    for (const e of computeEffects(op)) {
      if (e.role !== 'in_transit' && e.holdingId === holdingId && e.assetId === assetId) q = add(q, e.delta);
    }
  }
  return q;
}

export function isNegative(q: string): boolean {
  return cmp(q, '0') < 0;
}

/* ---------------- جلوگیری از ثبت تکراری ---------------- */

export interface DedupeKey {
  key: string;
  /** blocking: شناسهٔ معتبر یکتا (ارائه‌دهنده/منبع خارجی) — warning: هش (نیاز به تأیید) */
  strength: 'blocking' | 'warning';
  label: string;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * کلیدهای یکتایی یک عملیات.
 * برابری مبلغ یا تاریخ هرگز دلیل یکسان‌بودن نیست — فقط شناسه‌ها.
 */
export function dedupeKeys(op: Operation, ctx: LedgerContext): DedupeKey[] {
  const keys: DedupeKey[] = [];
  if (op.providerId && op.providerRef && op.providerRef.trim()) {
    keys.push({ key: `provider:${op.providerId}:${norm(op.providerRef)}`, strength: 'blocking', label: 'شناسهٔ عملیات نزد ارائه‌دهنده' });
  }
  const netOf = (assetId: string | null) => (assetId ? ctx.assets.get(assetId)?.networkId ?? null : null);
  const srcNet = netOf(op.from.assetId);
  const dstNet = netOf(op.to.assetId);
  if (op.sourceTxHash && op.sourceTxHash.trim()) {
    keys.push({ key: `chain:${srcNet ?? 'unknown'}:${norm(op.sourceTxHash)}`, strength: 'warning', label: 'هش تراکنش مبدا' });
  }
  if (op.destTxHash && op.destTxHash.trim()) {
    keys.push({ key: `chain:${dstNet ?? 'unknown'}:${norm(op.destTxHash)}`, strength: 'warning', label: 'هش تراکنش مقصد' });
  }
  for (const r of op.externalRefs) keys.push({ key: r.key, strength: 'blocking', label: 'رکورد منبع خارجی' });
  return keys;
}

export interface DuplicateHit {
  operationId: string;
  key: DedupeKey;
}

/** یافتن عملیات فعال دیگری با کلید مشترک */
export function findDuplicates(candidate: Operation, existing: Operation[], ctx: LedgerContext): DuplicateHit[] {
  const mine = dedupeKeys(candidate, ctx);
  if (mine.length === 0) return [];
  const hits: DuplicateHit[] = [];
  for (const other of existing) {
    if (other.id === candidate.id || other.voidedAt) continue;
    const theirs = new Set(dedupeKeys(other, ctx).map((k) => k.key));
    for (const k of mine) if (theirs.has(k.key)) hits.push({ operationId: other.id, key: k });
  }
  return hits;
}

/* ---------------- ویرایش / باطل‌کردن با سابقه ---------------- */

const FIELD_LABELS: [keyof Operation | string, string][] = [
  ['kind', 'نوع'],
  ['status', 'وضعیت'],
  ['verification', 'روش تأیید'],
  ['occurredAt', 'زمان'],
  ['from', 'مبدا'],
  ['to', 'مقصد'],
  ['providerId', 'ارائه‌دهنده'],
  ['providerRef', 'شناسهٔ عملیات'],
  ['sourceTxHash', 'هش مبدا'],
  ['destTxHash', 'هش مقصد'],
  ['trackingUrl', 'لینک رهگیری'],
  ['fees', 'کارمزدها'],
  ['note', 'یادداشت']
];

export function changedFields(prev: Operation, next: Operation): string[] {
  return FIELD_LABELS.filter(([k]) => JSON.stringify((prev as unknown as Record<string, unknown>)[k as string]) !== JSON.stringify((next as unknown as Record<string, unknown>)[k as string])).map(
    ([, l]) => l
  );
}

/** ویرایش: نسخهٔ جدید جایگزین می‌شود (اثر قبلی خودکار حذف می‌شود چون موجودی بازمحاسبه می‌شود) */
export function applyEdit(prev: Operation, next: Operation, now = Date.now()): Operation {
  const changed = changedFields(prev, next);
  return {
    ...next,
    id: prev.id,
    createdAt: prev.createdAt,
    source: prev.source,
    externalRefs: next.externalRefs,
    revision: prev.revision + 1,
    updatedAt: now,
    history: [...prev.history, { at: now, action: 'edited', summary: changed.length ? `تغییر: ${changed.join('، ')}` : 'بدون تغییر محتوایی' }],
    voidedAt: prev.voidedAt
  };
}

export function voidOperation(op: Operation, reason: string, now = Date.now()): Operation {
  return {
    ...op,
    voidedAt: now,
    voidReason: reason || null,
    updatedAt: now,
    revision: op.revision + 1,
    history: [...op.history, { at: now, action: 'voided', summary: reason ? `باطل شد: ${reason}` : 'باطل شد' }]
  };
}

export function restoreOperation(op: Operation, now = Date.now()): Operation {
  return {
    ...op,
    voidedAt: null,
    voidReason: null,
    updatedAt: now,
    revision: op.revision + 1,
    history: [...op.history, { at: now, action: 'restored', summary: 'بازگردانی شد' }]
  };
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** پیش‌نویس خالی — هیچ مقدار، آدرس، هش یا زمان ساختگی ندارد */
export function emptyOperation(kind: OperationKind, now = Date.now()): Operation {
  return {
    id: newId(),
    kind,
    status: 'completed',
    verification: 'user_reported',
    source: 'manual',
    occurredAt: null,
    timeZone: null,
    from: { holdingId: null, assetId: null, amount: null },
    to: { holdingId: null, assetId: null, amount: null },
    providerId: null,
    providerName: null,
    providerRef: null,
    sourceTxHash: null,
    destTxHash: null,
    trackingUrl: null,
    fees: [],
    valuation: null,
    note: null,
    externalRefs: [],
    createdAt: now,
    updatedAt: now,
    revision: 1,
    history: [],
    voidedAt: null
  };
}
