import { z } from 'zod';
const finite = z.number().finite().nullable();
const time = z.number().finite().nonnegative().nullable();
export const sectionKeys = ['dashboard', 'wallets', 'transactions', 'arcus', 'costBasis', 'markets', 'performance', 'boros', 'defi', 'simulation', 'calculators', 'vehicles', 'property', 'watchlist', 'preferences', 'security', 'designSystem'] as const;
export const statusSchema = z.enum(['ready', 'partial', 'stale', 'loading', 'unavailable', 'reference', 'empty', 'interface']);
export const metricsSchema = z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,39}$/), finite).refine(v => Object.keys(v).length <= 40);
export const insightRowSchema = z.object({
    name: z.string().max(160), symbol: z.string().max(40).optional(), kind: z.string().max(80),
    source: z.enum(['api', 'saved', 'simulation', 'session', 'reference']), status: statusSchema,
    asOf: time, metrics: metricsSchema
});
export type InsightRow = z.infer<typeof insightRowSchema>;
export const sectionSchema = z.object({
    key: z.enum(sectionKeys), name: z.string().max(80), status: statusSchema,
    fetchedAt: time, totalRows: z.number().int().nonnegative(), truncated: z.boolean(),
    note: z.string().max(600), rows: z.array(insightRowSchema).max(500)
});
export type AssistantSection = z.infer<typeof sectionSchema>;
const ranked = z.object({ name: z.string().max(160), symbol: z.string().max(40), kind: z.enum(['crypto', 'tokenized', 'tradfi']), returnPct: z.number().finite() });
export const appContextSchema = z.object({
    version: z.literal(1), generatedAt: z.number().finite().nonnegative(),
    cash: z.object({ walletStableUsd: finite, walletPartial: z.boolean(), arcusFreeCollateralUsd: finite, arcusPartial: z.boolean() }),
    sections: z.array(sectionSchema).max(17).refine(s => new Set(s.map(x => x.key)).size === s.length),
    rankings: z.array(z.object({
        period: z.enum(['1d', '7d', '30d', '60d', '90d']), universe: z.enum(['all', 'crypto', 'tokenized', 'tradfi']),
        available: z.number().int().nonnegative(), total: z.number().int().nonnegative(),
        mostProfit: z.array(ranked).max(3), leastProfit: z.array(ranked).max(3), leastLoss: z.array(ranked).max(3), mostLoss: z.array(ranked).max(3)
    })).max(20)
});
export type AppContext = z.infer<typeof appContextSchema>;
