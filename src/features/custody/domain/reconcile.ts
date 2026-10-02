/** ============================================================
 * تطبیق رکورد دستی با دادهٔ خارجی (Arcus accountTransferUpdates)
 *
 *  • هیچ ادغام خودکاری انجام نمی‌شود: فقط «پیشنهاد» ساخته می‌شود و کاربر تأیید می‌کند.
 *  • ربط‌دادن، یادداشت و فیلدهای دستی را دست نمی‌زند؛ فقط ExternalRef و سابقه اضافه می‌کند.
 *  • هر رکورد خارجی با کلید یکتای `arcus:{env}:{address}:{index}:transfer:{id}`
 *    فقط به یک عملیات می‌چسبد — import یا sync دوباره، تراکنش دوم نمی‌سازد.
 *  • برابری مبلغ/زمان فقط «نشانه» است، نه دلیل یکسان‌بودن.
 * ============================================================ */
import { arcusCollateralAssetId } from './catalog';
import { cmp } from './decimal';
import { emptyOperation, newId } from './ledger';
import type { ArcusEnv, Holding, Operation, OperationKind } from './types';

export interface ExternalTransfer {
  env: ArcusEnv;
  address: string;
  accountIndex: number;
  id: string;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'INTERNAL_TRANSFER' | 'SELF_ACCOUNT_TRANSFER' | 'REFERRAL_CLAIM' | string;
  status: string;
  amount: string;
  /** epoch microseconds طبق API — به‌صورت رشته تا دقت حفظ شود */
  createdAtUs: string;
}

export function arcusTransferKey(t: Pick<ExternalTransfer, 'env' | 'address' | 'accountIndex' | 'id'>): string {
  return `arcus:${t.env}:${t.address.toLowerCase()}:${t.accountIndex}:transfer:${t.id}`;
}

/** میکروثانیه (رشته) → میلی‌ثانیه برای نمایش/مقایسه — بدون از دست رفتن دقت ترتیب */
export function usToMs(us: string): number {
  // تقسیم رشته‌ای: سه رقم آخر حذف می‌شود (کف)، تا عدد در محدودهٔ امن JS بماند
  const s = us.replace(/^0+/, '') || '0';
  return s.length <= 3 ? 0 : Number(s.slice(0, -3));
}

export function kindForTransfer(type: string): OperationKind | null {
  if (type === 'DEPOSIT') return 'platform_deposit';
  if (type === 'WITHDRAWAL') return 'platform_withdrawal';
  return null;
}

/** آیا این holding همان زیرحساب Arcus است؟ */
export function holdingMatchesArcus(h: Holding, t: Pick<ExternalTransfer, 'env' | 'address' | 'accountIndex'>): boolean {
  return (
    h.kind === 'arcus' &&
    !!h.arcus &&
    h.arcus.env === t.env &&
    h.arcus.address.toLowerCase() === t.address.toLowerCase() &&
    h.arcus.accountIndex === t.accountIndex
  );
}

export type MatchConfidence = 'strong' | 'weak';

export interface MatchSuggestion {
  transferKey: string;
  operationId: string;
  confidence: MatchConfidence;
  reasons: string[];
}

export interface ReconcileItem {
  transfer: ExternalTransfer;
  key: string;
  /** عملیاتی که قبلاً به این رکورد ربط داده شده */
  linkedOperationId: string | null;
  importable: boolean;
  /** دلیل غیرقابل import بودن */
  note: string | null;
  suggestions: MatchSuggestion[];
}

const H48 = 48 * 3600_000;
const H2 = 2 * 3600_000;

export function reconcileTransfers(transfers: ExternalTransfer[], ops: Operation[], holdings: Holding[]): ReconcileItem[] {
  const active = ops.filter((o) => !o.voidedAt);
  const keyOwner = new Map<string, string>();
  for (const o of active) for (const r of o.externalRefs) keyOwner.set(r.key, o.id);

  return transfers.map((t) => {
    const key = arcusTransferKey(t);
    const linked = keyOwner.get(key) ?? null;
    const kind = kindForTransfer(t.type);
    let note: string | null = null;
    if (t.status !== 'APPLIED') note = 'رکورد ردشده — اثری روی موجودی ندارد';
    else if (!kind) note = 'این نوع رکورد (انتقال بین زیرحساب‌ها/جایزه) در این نسخه فقط نمایش داده می‌شود';
    const arcusHolding = holdings.find((h) => holdingMatchesArcus(h, t));
    if (!note && !arcusHolding) note = 'برای این زیرحساب هنوز محل نگهداری آرکوس ذخیره نشده';
    const importable = !linked && !note;

    const suggestions: MatchSuggestion[] = [];
    if (!linked && kind && arcusHolding && t.status === 'APPLIED') {
      const tMs = usToMs(t.createdAtUs);
      for (const o of active) {
        if (o.kind !== kind) continue;
        if (o.externalRefs.some((r) => r.system === 'arcus')) continue; // قبلاً به رکورد دیگری ربط داده شده
        const arcusLeg = kind === 'platform_deposit' ? o.to : o.from;
        if (arcusLeg.holdingId !== arcusHolding.id) continue;
        const reasons: string[] = [];
        const amountEq = arcusLeg.amount !== null && cmp(arcusLeg.amount, t.amount) === 0;
        if (amountEq) reasons.push('مقدار سمت آرکوس برابر است');
        let near = false;
        let close = false;
        if (o.occurredAt !== null) {
          const d = Math.abs(o.occurredAt - tMs);
          near = d <= H48;
          close = d <= H2;
          if (close) reasons.push('زمان کمتر از ۲ ساعت فاصله دارد');
          else if (near) reasons.push('زمان کمتر از ۴۸ ساعت فاصله دارد');
        }
        if (!amountEq && !near) continue;
        suggestions.push({
          transferKey: key,
          operationId: o.id,
          confidence: amountEq && close ? 'strong' : 'weak',
          reasons
        });
      }
    }

    return { transfer: t, key, linkedOperationId: linked, importable, note, suggestions };
  });
}

/** ربط‌دادن رکورد خارجی به عملیات دستی — فیلدهای دستی و یادداشت حفظ می‌شوند */
export function linkTransfer(op: Operation, t: ExternalTransfer, now = Date.now()): Operation {
  const key = arcusTransferKey(t);
  if (op.externalRefs.some((r) => r.key === key)) return op;
  return {
    ...op,
    externalRefs: [...op.externalRefs, { key, system: 'arcus', linkedAt: now }],
    verification: 'api_matched',
    updatedAt: now,
    revision: op.revision + 1,
    history: [...op.history, { at: now, action: 'linked', summary: `ربط به رکورد آرکوس ${t.id} (${t.env === 'mainnet' ? 'شبکهٔ اصلی' : 'شبکهٔ آزمایشی'})` }]
  };
}

/**
 * ساخت عملیات جدید از رکورد Arcus — فقط پس از انتخاب صریح کاربر.
 * سمت کیف پول نامعلوم می‌ماند (null) تا کاربر کامل کند؛ هیچ مقدار حدسی ساخته نمی‌شود.
 */
export function operationFromTransfer(t: ExternalTransfer, arcusHolding: Holding, now = Date.now()): Operation | null {
  const kind = kindForTransfer(t.type);
  if (!kind || t.status !== 'APPLIED') return null;
  const base = emptyOperation(kind, now);
  const asset = arcusCollateralAssetId(t.env);
  const arcusLeg = { holdingId: arcusHolding.id, assetId: asset, amount: t.amount };
  const empty = { holdingId: null, assetId: null, amount: null };
  return {
    ...base,
    id: newId(),
    source: 'arcus_import',
    status: 'completed',
    verification: 'api_matched',
    occurredAt: usToMs(t.createdAtUs),
    timeZone: 'UTC',
    providerId: 'arcus',
    from: kind === 'platform_deposit' ? empty : arcusLeg,
    to: kind === 'platform_deposit' ? arcusLeg : empty,
    externalRefs: [{ key: arcusTransferKey(t), system: 'arcus', linkedAt: now }],
    history: [{ at: now, action: 'created', summary: `ایجاد از رکورد آرکوس ${t.id} (${t.env === 'mainnet' ? 'شبکهٔ اصلی' : 'شبکهٔ آزمایشی'}) با تأیید شما` }]
  };
}
