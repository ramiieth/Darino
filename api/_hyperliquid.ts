/** ============================================================
 * درخواست سرور-سمت به API رسمی info هایپرلیکوئید (فقط‌خواندنی، بدون کلید)
 * سقف هایپرلیکوئید وزنی و برای هر IP است؛ مصرف‌کننده‌ها تعداد درخواست هر اجرا را کوچک نگه می‌دارند.
 * ============================================================ */

const HL_INFO = 'https://api.hyperliquid.xyz/info';

export async function hlInfo<T>(body: Record<string, unknown>, timeoutMs = 12_000): Promise<T> {
  const res = await fetch(HL_INFO, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) throw new Error(`hyperliquid HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** اجرای موازی محدود؛ خطای هر کار نتیجهٔ null می‌دهد و بقیه ادامه می‌یابند */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(items.length).fill(null);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        try {
          out[i] = await fn(items[i]);
        } catch {
          out[i] = null;
        }
      }
    })
  );
  return out;
}
