// @vitest-environment jsdom
/**
 * فاز ۴ تست‌ها — فالبک قیمت: فراخوانی API جایگزین وقتی قیمت N/A است
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  useLlamaFallbackStore,
  fetchMissingLlamaPrices,
  COIN_LLAMA_KEYS_VALID,
  COIN_LLAMA_CG_KEYS_VALID,
  resetLlamaFetchInFlight
} from '@/shared/hooks/useLlamaPriceFallback';
import { cacheClearPrices } from '@/shared/lib/db';

describe('ماژول ۵: فالبک قیمت Llama', () => {
  afterEach(async () => {
    useLlamaFallbackStore.getState().reset();
    await cacheClearPrices(); // پاک‌سازی کش حافظه‌ای که بین تست‌ها می‌ماند
    resetLlamaFetchInFlight();
    vi.unstubAllGlobals();
  });

  it('برای دارایی بدون قیمت، API جایگزین فراخوانی می‌شود و قیمت ذخیره می‌شود', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          coins: {
            'ethereum:0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3': {
              price: 0.42,
              symbol: 'ONDO'
            }
          }
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    // ondo در CoinGecko قیمت ندارد
    await fetchMissingLlamaPrices({ ethereum: 1875 });

    const state = useLlamaFallbackStore.getState();
    expect(state.prices.ondo).toBe(0.42);
    // کلید درخواست حاوی آدرس قرارداد ondo است
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3');
  });

  it('وقتی قیمت موجود است، درخواست اضافه ارسال نمی‌شود', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    // همه دارایی‌های نقشه (آدرسی + بومی) قیمت دارند → هیچ درخواستی نباید برود
    const fullPrices: Record<string, number> = {};
    for (const id of [...Object.keys(COIN_LLAMA_KEYS_VALID), ...COIN_LLAMA_CG_KEYS_VALID]) {
      fullPrices[id] = 1;
    }
    await fetchMissingLlamaPrices(fullPrices);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('خطای شبکه → بدون کرش؛ دارایی علامت تلاش‌شده می‌گیرد', { timeout: 15000 }, async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    await fetchMissingLlamaPrices({ ethereum: 1875 });
    expect(useLlamaFallbackStore.getState().attempted).toContain('ondo');
    expect(useLlamaFallbackStore.getState().prices.ondo).toBeUndefined();
  });

  it('پاسخ API بدون کوین → قیمت ذخیره نمی‌شود و علامت تلاش‌شده می‌گیرد', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ coins: {} }), { status: 200 }))
    );
    await fetchMissingLlamaPrices({ ethereum: 1875 });
    const s = useLlamaFallbackStore.getState();
    expect(s.prices.ondo).toBeUndefined();
    expect(s.attempted).toContain('ondo');
  });
});
