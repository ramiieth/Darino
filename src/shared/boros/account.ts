import { z } from 'zod';
import { Decimal } from 'decimal.js';
export const rootSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(v => v.toLowerCase());
export const handleSchema = z.string().regex(/^0x[0-9a-fA-F]{52}$/).transform(v => v.toLowerCase());
export const CROSS = 0xffffff;
export function packAccount(root: string, accountId: number, tokenId: number, marketId: number): string {
  root = rootSchema.parse(root);
  if (![accountId, tokenId, marketId].every(Number.isInteger) || accountId < 0 || accountId > 255 || tokenId < 1 || tokenId > 65535 || marketId < 1 || marketId > CROSS) throw new Error('invalid account');
  return '0x' + ((BigInt(root) << 48n) | (BigInt(accountId) << 40n) | (BigInt(tokenId) << 24n) | BigInt(marketId)).toString(16).padStart(52, '0');
}
export function unpackAccount(handle: string) {
  const n = BigInt(handleSchema.parse(handle));
  return { root: '0x' + (n >> 48n).toString(16).padStart(40, '0'), accountId: Number((n >> 40n) & 255n), tokenId: Number((n >> 24n) & 65535n), marketId: Number(n & BigInt(CROSS)) };
}
/** API balance / position units are x18 even for USDT; native token decimals never enter this conversion. */
export function x18(v: unknown): number | null {
  if (typeof v !== 'string' || !/^-?\d{1,80}$/.test(v)) return null;
  const n = new Decimal(v).div('1000000000000000000').toNumber();
  return Number.isFinite(n) ? n : null;
}
export function toX18(v: string): string {
  if (!/^(?:\d+(?:\.\d{0,18})?|\.\d{1,18})$/.test(v)) throw new Error('invalid size');
  const [whole, fraction=''] = v.split('.');
  const result=BigInt(whole||'0')*1000000000000000000n+BigInt(fraction.padEnd(18,'0'));
  if(result<=0n||result.toString().length>60)throw new Error('invalid size');
  return result.toString();
}

const num = z.number().finite().nullable();
const text = z.string().max(160);
export const assetSchema = z.object({ tokenId: z.number().int().positive(), symbol: text, priceUsd: num, logo: z.string().max(600).nullable() });
export const balanceSchema = z.object({ handle: handleSchema, tokenId: z.number().int(), marketId: z.number().int(), cash: num, equity: num, margin: num, freeMargin: num, maintenanceBuffer: num });
export const positionSchema = z.object({ handle: handleSchema, marketId: z.number().int(), tokenId: z.number().int(), side: z.enum(['long','short']), size: num, fixedApr: num, unrealized: num, realizedTrade: num, settlement: num, liquidationApr: num, matured: z.boolean() });
export const eventSchema = z.object({ id: text, marketId: z.number().int().nullable(), tokenId: z.number().int(), at: num, kind: text, amount: num, fee: num, rate: num });
export const accountSnapshotSchema = z.object({ root: rootSchema, accountId: z.number().int().min(0).max(255), fetchedAt: z.number().finite(), syncedAt: num, balances: z.array(balanceSchema).max(100), positions: z.array(positionSchema).max(200), assets: z.array(assetSchema).max(100), settlements: z.array(eventSchema).max(100), transfers: z.array(eventSchema).max(100), orders: z.array(z.object({ id: text, marketId: z.number().int(), side: z.enum(['long','short']), size: num, rate: num, margin: num })).max(100), partial: z.boolean(), historyComplete: z.boolean(), errors: z.array(text).max(10) });
export type BorosAccountSnapshot = z.infer<typeof accountSnapshotSchema>;
export const previewRequestSchema = z.object({ marketAcc: handleSchema, marketId: z.number().int().min(1).max(CROSS-1), side: z.union([z.literal(0),z.literal(1)]), size: z.string().regex(/^[1-9]\d{0,59}$/), tif: z.literal(2), slippage: z.number().finite().min(0).max(0.5) }).strict();
export const officialPreviewSchema = z.object({ fetchedAt: z.number().finite(), handle: handleSchema, marketId: z.number().int(), side: z.enum(['long','short']), requestedSize: num, matchedSize: num, matchedApr: num, margin: num, liquidationApr: num, priceImpact: num, status: text, success: z.boolean() });
export type OfficialPreview = z.infer<typeof officialPreviewSchema>;
export function accountTotals(s: BorosAccountSnapshot) {
 const prices = new Map(s.assets.map(a => [a.tokenId,a.priceUsd]));
 const usd = (n: number | null, id: number) => n !== null && prices.get(id) != null && prices.get(id)! > 0 ? n * prices.get(id)! : null;
 const sum = (xs: (number|null)[]) => xs.some(x=>x===null) ? null : xs.reduce<number>((a,b)=>a+b!,0);
 return { equityUsd: sum(s.balances.map(b=>usd(b.equity,b.tokenId))), freeMarginUsd: sum(s.balances.map(b=>usd(b.freeMargin,b.tokenId))), unrealizedUsd: sum(s.positions.map(p=>usd(p.unrealized,p.tokenId))), realizedTradeUsd: sum(s.positions.map(p=>usd(p.realizedTrade,p.tokenId))), settlementUsd: sum(s.positions.map(p=>usd(p.settlement,p.tokenId))) };
}
