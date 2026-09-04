/**
 * ماژول ۵: فالبک سراسری قیمت (coins.llama.fi)
 *
 * وقتی قیمت یک رمزارز از CoinGecko null/N/A باشد، قیمت جایگزین از
 * coins.llama.fi گرفته می‌شود (CORS باز — همیشه از مرورگر قابل دسترس):
 *  - فاز ۱: کلیدهای آدرس قرارداد (ERC-20 و …) → یک درخواست دسته‌ای
 *  - فاز ۲: سکه‌های بومی (BTC/XRP/DOGE/…) → تکتک با پیشوند coingecko: و همزمانی ۴
 * قیمت‌ها در Zustand ذخیره می‌شوند → فقط کامپوننت‌های مشترک re-render می‌شوند
 * (نه کل صفحه) و نتیجه در IndexedDB کش می‌شود.
 */
import { create } from 'zustand';
import { cacheGetPrice, cachePutPrice } from '@/shared/lib/db';
import { fetchWithRetry } from '@/shared/lib/fetchWithRetry';

/** قیمت‌های llama (محلی — مستقل از سرویس دیفای) */
async function fetchLlamaPrices(keys: string[]): Promise<{ coins: Record<string, { price: number }> }> {
  if (keys.length === 0) return { coins: {} };
  const url = `https://coins.llama.fi/prices/current/${keys.map(encodeURIComponent).join(',')}`;
  const res = await fetchWithRetry(url, { retries: 0, timeoutMs: 10_000 });
  if (!res.ok) return { coins: {} };
  return (await res.json()) as { coins: Record<string, { price: number }> };
}

/**
 * نقشه رمزارزها → کلید coins.llama.fi (آدرس قرارداد در زنجیره اصلی)
 * ⚠️ همه کلیدها با درخواست واقعی API تأیید شده‌اند (قیمت برمی‌گردانند).
 */
export const COIN_LLAMA_KEYS: Record<string, string> = {
  /* ---------- اتریوم (ERC-20) ---------- */
  ethereum: 'ethereum:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  tether: 'ethereum:0xdAC17F958D2ee523a2206206994597C13D831ec7',
  'usd-coin': 'ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  dai: 'ethereum:0x6B175474E89094C44Da98b954EedeAC495271d0F',
  'wrapped-bitcoin': 'ethereum:0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  'staked-ether': 'ethereum:0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
  'wrapped-steth': 'ethereum:0x7f39C581F595B53C5cb19bD0b3f8dA6c935E2Ca0',
  'rocket-pool-eth': 'ethereum:0xae78736Cd615f374D3085123A210448E74Fc6393',
  weeth: 'ethereum:0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee',
  ondo: 'ethereum:0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3',
  ethena: 'ethereum:0x57e114B691Db790C35207b2e685D4A43181e6061',
  pendle: 'ethereum:0x808507121B80c02388fAd14726482e061B8da827',
  uniswap: 'ethereum:0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
  aave: 'ethereum:0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
  chainlink: 'ethereum:0x514910771AF9Ca656af840dff83E8264EcF986CA',
  'lido-dao': 'ethereum:0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32',
  maker: 'ethereum:0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2',
  'curve-dao-token': 'ethereum:0xD533a949740bb3306d119CC777fa900bA034cd52',
  compound: 'ethereum:0xc00e94Cb662C3520282E6f5717214004A7f26888',
  synthetix: 'ethereum:0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F',
  'yearn-finance': 'ethereum:0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e',
  'the-graph': 'ethereum:0xc944E90C64B2c07662A292be6244BDf05Cda44a7',
  '1inch': 'ethereum:0x111111111117dC0aa78b770fA6A738034120C302',
  ens: 'ethereum:0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72',
  quant: 'ethereum:0x4a220E6096B25EADb88358cb44068A3248254675',
  pepe: 'ethereum:0x6982508145454Ce325dDbE47a25d4ec3d2311933',
  'shiba-inu': 'ethereum:0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
  'tether-gold': 'ethereum:0x68749665FF8D2d112Fa859AA293F07A622782F38',
  'pax-gold': 'ethereum:0x45804880De22913dAFE09f4980848ECE6EcbAf78',
  'ether-fi': 'ethereum:0xFe0c30065B384F05761f15d0CC899D4F9F9Cc0eB',
  'fetch-ai': 'ethereum:0xaea46A60368A7bD060eec7DF8CBa43b7EF41Ad85',
  'render-token': 'ethereum:0x6de037ef9ad2725eb40118bb1702ebb27e4aeb24',
  apecoin: 'ethereum:0x4d224452801ACEd8B2F0aebE155379bb5D594381',
  'axie-infinity': 'ethereum:0xBB0E17EF65F82Ab018d8EDd776e8DD940327B28b',
  gala: 'ethereum:0x15D4c048F83bd7e37d49eA4C83a07267Ec4203dA',
  'the-sandbox': 'ethereum:0x3845badAde8e6dFF049820680d1F14bD3903a5d0',
  mantle: 'ethereum:0x3c3a81e81dc49A522A592e7622A7E711c06bf354',
  arbitrum: 'ethereum:0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1',
  toncoin: 'ethereum:0x582d872A1B094FC48F5de31D3B73F2D9bE47def1',
  /* ---------- بایننس اسمارت چین ---------- */
  binancecoin: 'bsc:0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  'binance-usd': 'bsc:0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
  pancakeswap: 'bsc:0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
  /* ---------- زنجیره‌های دیگر (آدرس بومی) ---------- */
  solana: 'solana:So11111111111111111111111111111111111111112',
  avalanche: 'avax:0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
  sui: 'sui:0x2::sui::SUI',
  aptos: 'aptos:0x1::aptos_coin::AptosCoin'
};

/**
 * سکه‌های بومی (بدون آدرس قرارداد در llama) → تکتک با پیشوند coingecko:
 * (همگی با درخواست واقعی API تأیید شده‌اند)
 */
export const COIN_LLAMA_CG_KEYS: Record<string, string> = {
  bitcoin: 'bitcoin',
  ripple: 'ripple',
  dogecoin: 'dogecoin',
  litecoin: 'litecoin',
  cardano: 'cardano',
  polkadot: 'polkadot',
  tron: 'tron',
  cosmos: 'cosmos',
  algorand: 'algorand',
  monero: 'monero',
  filecoin: 'filecoin',
  stellar: 'stellar',
  zcash: 'zcash',
  tezos: 'tezos',
  dash: 'dash',
  flow: 'flow',
  fantom: 'fantom',
  celo: 'celo',
  kusama: 'kusama',
  decred: 'decred',
  eos: 'eos',
  'internet-computer': 'internet-computer',
  near: 'near',
  kaspa: 'kaspa'
};

/** کلیدهایی که آدرس واقعی دارند و برای فالبک دسته‌ای معتبرند */
export const COIN_LLAMA_KEYS_VALID: Record<string, string> = Object.fromEntries(
  Object.entries(COIN_LLAMA_KEYS).filter(([, v]) => v.includes(':'))
);

/** کلیدهای سکه‌های بومی (تک‌تک) */
export const COIN_LLAMA_CG_KEYS_VALID: string[] = Object.keys(COIN_LLAMA_CG_KEYS);

interface LlamaFallbackState {
  /** شناسه CoinGecko → قیمت */
  prices: Record<string, number>;
  /** کلیدهای قبلاً تلاش‌شده (حتی ناموفق) — جلوگیری از درخواست تکراری */
  attempted: string[];
  setPrice: (id: string, price: number) => void;
  markAttempted: (id: string) => void;
  reset: () => void;
}

export const useLlamaFallbackStore = create<LlamaFallbackState>((set) => ({
  prices: {},
  attempted: [],
  setPrice: (id, price) =>
    set((s) => ({ prices: { ...s.prices, [id]: price }, attempted: [...s.attempted, id] })),
  markAttempted: (id) =>
    set((s) => (s.attempted.includes(id) ? s : { attempted: [...s.attempted, id] })),
  reset: () => set({ prices: {}, attempted: [] })
}));

/** همزمانی محدود (حداکثر ۴ درخواست همزمان) — قیمت تکتک سکه‌های بومی */
async function fetchCgSingles(ids: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= ids.length) return;
      const id = ids[i];
      try {
        const url = `https://coins.llama.fi/prices/current/coingecko:${encodeURIComponent(id)}`;
        const res = await fetchWithRetry(url, { retries: 1, timeoutMs: 10_000 });
        if (!res.ok) continue;
        const body = (await res.json()) as { coins?: Record<string, { price?: number }> };
        const p = body.coins?.[`coingecko:${id}`]?.price;
        if (p !== undefined && Number.isFinite(p) && p > 0) out[id] = p;
      } catch {
        /* خاموش — سکه در attempt ثبت می‌شود */
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, ids.length) }, () => worker()));
  return out;
}

let llamaFetchInFlight: Promise<void> | null = null;

/** پاک‌سازی صف درون‌حافظه‌ای (برای تست) */
export function resetLlamaFetchInFlight(): void {
  llamaFetchInFlight = null;
}

/**
 * برای رمزارزهای بدون قیمت زنده CoinGecko، قیمت Llama را می‌گیرد.
 * فقط یک بار در هر نشست تلاش می‌شود + کش IndexedDB (۲۴ ساعت).
 *  فاز ۱: کلیدهای آدرس → یک درخواست دسته‌ای
 *  فاز ۲: سکه‌های بومی → تکتک (همزمانی ۴)
 */
export async function fetchMissingLlamaPrices(
  livePrices: Record<string, number>
): Promise<void> {
  if (llamaFetchInFlight) return llamaFetchInFlight;
  llamaFetchInFlight = (async () => {
    const store = useLlamaFallbackStore.getState();
    const isMissing = (id: string) =>
      !store.attempted.includes(id) &&
      (livePrices[id] === undefined || livePrices[id] === null);

    const missingAddr = Object.keys(COIN_LLAMA_KEYS_VALID).filter(isMissing);
    const missingCg = Object.keys(COIN_LLAMA_CG_KEYS).filter(isMissing);
    if (missingAddr.length === 0 && missingCg.length === 0) return;

    // کش IndexedDB
    const allIds = [...missingAddr, ...missingCg];
    const cached = await Promise.all(
      allIds.map(async (id) => ({ id, rec: await cacheGetPrice(`llama:${id}`) }))
    );
    const cachedIds = new Set(
      cached.filter((c) => c.rec && Number.isFinite(c.rec.price)).map((c) => c.id)
    );
    for (const c of cached) {
      if (cachedIds.has(c.id)) store.setPrice(c.id, (c.rec as { price: number }).price);
    }
    const needAddr = missingAddr.filter((id) => !cachedIds.has(id));
    const needCg = missingCg.filter((id) => !cachedIds.has(id));
    if (needAddr.length === 0 && needCg.length === 0) return;

    try {
      // فاز ۱: کلیدهای آدرس — یک درخواست دسته‌ای
      if (needAddr.length > 0) {
        try {
          const keys = needAddr.map((id) => COIN_LLAMA_KEYS_VALID[id]);
          const res = await fetchLlamaPrices(keys);
          for (const id of needAddr) {
            const coin = res.coins?.[COIN_LLAMA_KEYS_VALID[id]];
            if (coin && Number.isFinite(coin.price) && coin.price > 0) {
              store.setPrice(id, coin.price);
              void cachePutPrice(`llama:${id}`, {
                price: coin.price,
                source: 'snapshot',
                fetchedAt: Date.now()
              });
            } else {
              store.markAttempted(id);
            }
          }
        } catch {
          needAddr.forEach((id) => store.markAttempted(id));
        }
      }
      // فاز ۲: سکه‌های بومی — تکتک با همزمانی ۴
      if (needCg.length > 0) {
        const prices = await fetchCgSingles(needCg);
        for (const id of needCg) {
          const p = prices[id];
          if (p !== undefined) {
            store.setPrice(id, p);
            void cachePutPrice(`llama:${id}`, {
              price: p,
              source: 'snapshot',
              fetchedAt: Date.now()
            });
          } else {
            store.markAttempted(id);
          }
        }
      }
    } catch {
      // خطا → علامت تلاش‌شده تا درخواست تکراری نزند
      [...needAddr, ...needCg].forEach((id) => store.markAttempted(id));
    }
  })().finally(() => {
    llamaFetchInFlight = null;
  });
  return llamaFetchInFlight;
}

/** ادغام قیمت‌ها: CoinGecko → فالبک Llama (تابع خالص برای تست) */
export function mergePriceMaps(
  primary: Record<string, number>,
  fallback: Record<string, number>
): Record<string, number> {
  const out = { ...primary };
  for (const [id, p] of Object.entries(fallback)) {
    if (out[id] === undefined || out[id] === null || !Number.isFinite(out[id])) {
      out[id] = p;
    }
  }
  return out;
}
