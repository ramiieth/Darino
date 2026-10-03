import Decimal from 'decimal.js';
import type { CostBook, CostAsset } from './book';
export interface CurrentBasis { asset: CostAsset; quantity: string; total: string; at: number; pendingBalanceConfirmation?: boolean }
/** Reconciliation of current balance, never a fictional dated purchase. */
export function reconcileBasis(book: CostBook | undefined, asset: CostAsset, quantity: string, total: string, at: number, pendingBalanceConfirmation = false): CostBook {
 const q = new Decimal(quantity), cost = new Decimal(total);
 if (!q.isFinite() || !q.gt(0) || !cost.isFinite() || cost.lt(0) || !Number.isFinite(at)) throw Error('موجودی یا بهای تمام‌شده معتبر نیست');
 const previous = book?.currentBasis?.[asset.key];
 return { ...(book ?? { version: 1, asOf: at, lots: [], migrationConfirmed: false, legacyRetired: false }), currentBasis: { ...book?.currentBasis, [asset.key]: { asset, quantity: q.toString(), total: cost.toString(), at, ...(pendingBalanceConfirmation?{pendingBalanceConfirmation:true}:{}) } }, basisHistory: [...(book?.basisHistory ?? []), ...(previous ? [previous] : [])] };
}

export function validCurrentBasis(value: CurrentBasis | undefined, key: string): value is CurrentBasis {
 try { return !!value && (value.pendingBalanceConfirmation===undefined||typeof value.pendingBalanceConfirmation==='boolean') && value.asset?.key===key && new Decimal(value.quantity).isFinite() && new Decimal(value.quantity).gt(0) && new Decimal(value.total).isFinite() && new Decimal(value.total).gte(0) && Number.isFinite(value.at); } catch { return false; }
}
