/**
 * سرویس DefiLlama — فقط اندپوینت‌های رسمی chains و protocols
 * (بازدهی/استیبل‌کوین حذف شدند — بازارها از CoinGecko و Pendle)
 */
import { fetchJson } from '@/shared/lib/fetchWithRetry';
import type { ChainsResponse, ProtocolRow } from '@/features/defi/domain/logic';

const LLAMA = 'https://api.llama.fi';

/** شبکه‌ها (TVL کل دیفای) */
export async function fetchChains(): Promise<ChainInfo[]> {
  return fetchJson<ChainInfo[]>(`${LLAMA}/v2/chains`);
}

/** پروتکل‌ها (فعلاً استفاده نمی‌شود — آماده برای آینده) */
export async function fetchProtocols(): Promise<ProtocolRow[]> {
  return fetchJson<ProtocolRow[]>(`${LLAMA}/protocols`);
}

import type { ChainInfo } from '@/features/defi/domain/logic';
