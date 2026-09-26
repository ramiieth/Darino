/** ============================================================
 * Property Market — اسکریپت «پل مرورگر» (Bookmarklet)
 *
 * روی divar.ir یا sheypoor.com (در مرورگر خود کاربر) اجرا می‌شود:
 *  - همان کلکشنر تست‌شده (collectChunk) را با fetch همان سایت اجرا می‌کند
 *    (CORS مجاز است چون درخواست از خود سایت است؛ IP کاربر مسدود نمی‌شود)
 *  - نتیجه را با postMessage به دارینو می‌فرستد (یا فایل JSON دانلود می‌کند)
 *
 * این فایل هنگام build با esbuild به یک IIFE باندل می‌شود (virtual:pm-bookmarklet)
 * و origin دارینو هنگام ساخت لینک در صفحه جایگزین `%%DARINO_ORIGIN%%` می‌شود.
 * ⚠️ هیچ import از React/Dexie/import.meta اینجا مجاز نیست.
 * ============================================================ */
import { collectChunk, newCursor, type CollectCursor } from '../collector/run';
import type { ParsedListingSeed } from '../collector/parse';
import { BRIDGE_PAGE_PATH, MSG_ACK, MSG_PAYLOAD, MSG_READY, detectSource, makeSeedPayload, type SeedPayload } from './protocol';

declare const __DARINO_ORIGIN__: string;

interface BridgeWindow extends Window {
  __darinoPmBridge?: boolean;
}

const FA = (n: number) => n.toLocaleString('fa-IR');

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (text !== undefined) e.textContent = text;
  return e;
}

const BTN =
  'font:inherit;font-size:13px;font-weight:700;border:0;border-radius:10px;padding:9px 14px;cursor:pointer;margin:4px 0 0 6px;';

function run(): void {
  const w = window as BridgeWindow;
  const origin = __DARINO_ORIGIN__;
  const source = detectSource(location.hostname);
  if (!source) {
    alert('این ابزار را روی سایت divar.ir یا sheypoor.com اجرا کنید (دارینو — بازار املاک).');
    return;
  }
  if (w.__darinoPmBridge) return;
  w.__darinoPmBridge = true;

  /* ---------- پنل وضعیت ---------- */
  const box = el(
    'div',
    'position:fixed;z-index:2147483647;bottom:16px;left:16px;right:16px;max-width:420px;margin:0 auto;' +
      'background:#0f172a;color:#f8fafc;border-radius:16px;padding:16px;direction:rtl;text-align:right;' +
      'font-family:Vazirmatn,Tahoma,sans-serif;font-size:13px;line-height:1.8;box-shadow:0 12px 40px rgba(0,0,0,.35)'
  );
  const title = el('div', 'font-weight:800;font-size:14px;margin-bottom:4px', `دارینو — جمع‌آوری آپارتمان‌های اهواز از ${source === 'divar' ? 'دیوار' : 'شیپور'}`);
  const status = el('div', 'color:#cbd5e1', 'در حال شروع…');
  const bar = el('div', 'height:6px;background:#1e293b;border-radius:6px;margin:10px 0;overflow:hidden');
  const fill = el('div', 'height:100%;width:3%;background:#38bdf8;transition:width .3s');
  bar.appendChild(fill);
  const actions = el('div', 'display:flex;flex-wrap:wrap');
  const cancelBtn = el('button', BTN + 'background:#334155;color:#f8fafc', 'توقف و استفاده از داده فعلی');
  actions.appendChild(cancelBtn);
  box.append(title, status, bar, actions);
  document.body.appendChild(box);

  let cancelled = false;
  cancelBtn.onclick = () => {
    cancelled = true;
    cancelBtn.disabled = true;
    cancelBtn.textContent = 'در حال توقف…';
  };

  const close = () => {
    box.remove();
    w.__darinoPmBridge = false;
  };

  /* ---------- حلقه کلکشن ---------- */
  void (async () => {
    const seeds: ParsedListingSeed[] = [];
    let cursor: CollectCursor = newCursor(source);
    let cityId: string | null = null;
    let details = 0;
    let failures = 0;
    let consecutiveErrors = 0;
    while (!cancelled) {
      try {
        const r = await collectChunk({
          city: 'ahvaz',
          source,
          cursor,
          pauseMs: 600,
          detailBudget: 8,
          timeBudgetMs: 30_000,
          sheypoorBase: source === 'sheypoor' ? location.origin : undefined
        });
        consecutiveErrors = 0;
        cursor = r.cursor;
        cityId = r.cityId;
        seeds.push(...r.seeds);
        details += r.fetchedDetails;
        failures += r.failedDetails;
        const seen = cursor.seenTokens.length;
        status.textContent = `صفحه ${FA(cursor.pagesRead)} · آگهی دیده‌شده ${FA(seen)} · جزئیات ${FA(details)}${failures ? ` · ناموفق ${FA(failures)}` : ''}`;
        fill.style.width = `${Math.min(95, 5 + cursor.pagesRead * 4)}%`;
        if (r.done) break;
      } catch (e) {
        consecutiveErrors += 1;
        status.textContent = `خطای شبکه (${consecutiveErrors}/۳): ${e instanceof Error ? e.message.slice(0, 80) : ''}`;
        if (consecutiveErrors >= 3) break;
        await new Promise((res) => setTimeout(res, 3000 * consecutiveErrors));
      }
    }
    // آگهی‌های در انتظار جزئیات (در صورت توقف) هم با داده ناقص ارسال می‌شوند؛ پاک‌سازی تصمیم می‌گیرد
    seeds.push(...cursor.pendingSeeds);
    fill.style.width = '100%';
    finish(makeSeedPayload({ source, cityId, seeds, via: 'bridge' }));
  })();

  /* ---------- ارسال به دارینو ---------- */
  function finish(payload: SeedPayload): void {
    actions.innerHTML = '';
    if (payload.seeds.length === 0) {
      status.textContent = 'آگهی‌ای جمع‌آوری نشد. اتصال اینترنت را بررسی و دوباره تلاش کنید.';
      const x = el('button', BTN + 'background:#334155;color:#f8fafc', 'بستن');
      x.onclick = close;
      actions.appendChild(x);
      return;
    }
    status.textContent = `${FA(payload.seeds.length)} آگهی آماده است. «ارسال به دارینو» را بزنید.`;
    const send = el('button', BTN + 'background:#38bdf8;color:#0f172a', 'ارسال به دارینو');
    const save = el('button', BTN + 'background:#334155;color:#f8fafc', 'دانلود فایل');
    const x = el('button', BTN + 'background:transparent;color:#94a3b8', 'بستن');
    actions.append(send, save, x);
    x.onclick = close;

    save.onclick = () => {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `darino-${payload.source}-${new Date(payload.collectedAt).toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      status.textContent = 'فایل ذخیره شد — در دارینو از «ورود فایل» استفاده کنید.';
    };

    send.onclick = () => {
      // باز کردن دارینو (کلیک کاربر = مجاز برای popup) و دست‌دادن: دارینو «ready» می‌فرستد
      const target = window.open(`${origin}${BRIDGE_PAGE_PATH}&t=${Date.now()}`, 'darino-pm-bridge');
      if (!target) {
        status.textContent = 'مرورگر پنجره را مسدود کرد — «دانلود فایل» را بزنید و در دارینو وارد کنید.';
        return;
      }
      status.textContent = 'در انتظار پاسخ دارینو…';
      let delivered = false;
      let sent = false;
      const onMsg = (ev: MessageEvent) => {
        if (ev.origin !== origin || !ev.data || typeof ev.data !== 'object') return;
        const data = ev.data as { type?: string; ok?: boolean; added?: number; error?: string };
        if (data.type === MSG_READY && !sent) {
          // فقط یک‌بار — «ready» هر ثانیه تکرار می‌شود
          sent = true;
          (ev.source as Window | null)?.postMessage({ type: MSG_PAYLOAD, payload }, origin);
        } else if (data.type === MSG_ACK) {
          delivered = true;
          window.removeEventListener('message', onMsg);
          status.textContent = data.ok
            ? `✓ در دارینو ثبت شد — ${FA(data.added ?? 0)} آگهی جدید. می‌توانید این پنل را ببندید.`
            : `دارینو داده را نپذیرفت: ${data.error ?? ''}`;
        }
      };
      window.addEventListener('message', onMsg);
      setTimeout(() => {
        if (!delivered) status.textContent = 'پاسخی از دارینو نرسید — «دانلود فایل» را بزنید و در دارینو وارد کنید.';
      }, 45_000);
    };
  }
}

run();
