/**
 * تطبیق و همگام‌سازی حسابداری (چنددستگاهی)
 *  • وضعیت همگام‌سازی حسابداری با سرور (Neon) و دکمهٔ «همگام‌سازی اکنون»
 *  • بررسی سازگاری: برای هر دارایی، ماندهٔ حساب در دفتر کل (بهای تمام‌شده) باید با
 *    بهای لات‌های باز برابر باشد — اختلاف یعنی سندی از دستگاه دیگر به این‌جا نرسیده یا مبنا ناقص است.
 *  • مبنای لات‌ها: نمایش و (با تأیید صریح) جایگزینی با لات‌های ذخیره‌شدهٔ همین دستگاه
 *  • عملیات دارایی چندشبکه‌ای که هنوز وارد دفتر کل نشده‌اند، با دلیل
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { toast } from '@/shared/store/toastStore';
import { fmtDateTime, toFaDigits } from '@/shared/utils/formatters';
import { assetDisplayName } from '@/shared/i18n/assetDisplayName';
import { syncAccountingWithRemote } from '@/repositories/accountingRepository';
import { useAccountingData } from './AccountingContext';
import { lotBasisBySymbol, PENDING_TEXT } from '../domain/lotReplay';
import { replaceBaseline } from '../data/lotBaseline';
import { useCustody } from '@/features/custody/data/useCustody';
import { KIND_META } from '@/features/custody/domain/ledger';

export function ReconcilePanel() {
  const acc = useAccountingData();
  const custody = useCustody();
  const [syncing, setSyncing] = useState(false);
  const [lastReport, setLastReport] = useState<string | null>(null);
  const [confirmBase, setConfirmBase] = useState(false);

  const checks = useMemo(() => {
    const lotMap = lotBasisBySymbol(acc.lots);
    const symbols = new Set<string>(lotMap.keys());
    for (const r of acc.ledger) if (r.account.key.startsWith('crypto:')) symbols.add(r.account.key.slice(7));
    return [...symbols]
      .map((sym) => {
        const ledgerBal = acc.ledger.find((r) => r.account.key === `crypto:${sym}`)?.balance ?? 0;
        const lot = lotMap.get(sym) ?? { qty: 0, basis: 0 };
        const diff = ledgerBal - lot.basis;
        return { sym, ledgerBal, lotBasis: lot.basis, qty: lot.qty, ok: Math.abs(diff) < 0.01 };
      })
      .filter((c) => Math.abs(c.ledgerBal) > 0.005 || c.qty > 1e-9)
      .sort((a, b) => Number(a.ok) - Number(b.ok));
  }, [acc.lots, acc.ledger]);

  const storedBasis = useMemo(() => lotBasisBySymbol(acc.storedLots), [acc.storedLots]);
  const baseBasis = useMemo(() => lotBasisBySymbol(acc.baseline?.lots ?? []), [acc.baseline]);
  const baselineDiffers = useMemo(() => {
    const keys = new Set([...storedBasis.keys(), ...baseBasis.keys()]);
    return [...keys].some((k) => Math.abs((storedBasis.get(k)?.qty ?? 0) - (baseBasis.get(k)?.qty ?? 0)) > 1e-9);
  }, [storedBasis, baseBasis]);

  const pendingByOp = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of acc.pendingCustody) m.set(p.operationId, [...(m.get(p.operationId) ?? []), PENDING_TEXT[p.reason]]);
    return [...m.entries()];
  }, [acc.pendingCustody]);

  const mismatches = checks.filter((c) => !c.ok).length;

  return (
    <div className="space-y-6">
      <Surface className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">همگام‌سازی حسابداری با سرور</p>
          <p className="text-xs text-muted">
            {toFaDigits(acc.storedEntries.length)} تراکنش ذخیره‌شده روی این دستگاه
            {lastReport ? ` · ${lastReport}` : ''}
          </p>
        </div>
        <Button
          variant="secondary"
          icon={<RefreshCw className={syncing ? 'animate-spin' : ''} />}
          loading={syncing}
          onClick={async () => {
            setSyncing(true);
            try {
              const r = await syncAccountingWithRemote();
              if (!r) {
                setLastReport('سرور در دسترس نیست یا وارد نشده‌اید');
              } else {
                setLastReport(`ارسال ${toFaDigits(r.pushed.entries)} · دریافت ${toFaDigits(r.pulled.entries)} تراکنش`);
                await acc.refresh();
              }
            } finally {
              setSyncing(false);
            }
          }}
        >
          همگام‌سازی اکنون
        </Button>
      </Surface>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-ink">بررسی هم‌خوانی موجودی‌ها</h2>
          {mismatches === 0 ? <Badge tone="gain" icon={<CheckCircle2 />}>سازگار</Badge> : <Badge tone="warn" icon={<AlertTriangle />}>{toFaDigits(mismatches)} اختلاف</Badge>}
        </div>
        <p className="text-xs leading-5 text-muted">
          برای هر دارایی، هزینهٔ خرید در خلاصهٔ حساب‌ها باید با جمع خریدهای باقی‌مانده برابر باشد. اختلاف یعنی تراکنشی از دستگاه دیگر هنوز نرسیده یا نقطهٔ شروع خریدها با حسابداری جور نیست.
        </p>
        {checks.length === 0 ? (
          <EmptyState message="دارایی رمزارزی در حسابداری نیست" />
        ) : (
          <Surface className="divide-y divide-divider">
            {checks.map((c) => (
              <div key={c.sym} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <span className="font-semibold text-ink">{assetDisplayName(c.sym).name}</span>
                {c.ok ? <Badge tone="gain">سازگار</Badge> : <Badge tone="warn">اختلاف</Badge>}
                <span className="ms-auto text-xs text-muted">
                  خلاصهٔ حساب‌ها <MoneyValue value={c.ledgerBal} /> · خریدها <MoneyValue value={c.lotBasis} />
                </span>
              </div>
            ))}
          </Surface>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-ink">نقطهٔ شروع خریدها</h2>
        {acc.baseline ? (
          <p className="text-xs leading-5 text-muted">
            نقطهٔ شروع در {fmtDateTime(acc.baseline.createdAt)} ساخته شده و بین دستگاه‌ها همگام است. خریدهای بعدی از روی تراکنش‌های بعد از آن و عملیات دارایی شبکه‌ای حساب می‌شوند.
          </p>
        ) : (
          <Notice tone="info">نقطهٔ شروع خریدها هنوز ساخته نشده؛ پس از اولین همگام‌سازی خودکار ساخته می‌شود.</Notice>
        )}
        {acc.baseline && baselineDiffers && (
          <Notice tone="warn" title="خریدهای ذخیره‌شدهٔ این دستگاه با نقطهٔ شروع فرق دارد">
            <p>اگر مطمئنید حسابداری همین دستگاه کامل‌تر است (مثلاً دستگاه دیگر تراکنش‌هایی را از دست داده)، می‌توانید نقطهٔ شروع را با خریدهای این دستگاه جایگزین کنید. این تغییر به همهٔ دستگاه‌ها می‌رسد.</p>
            {!confirmBase ? (
              <Button className="mt-2" size="sm" variant="outline" onClick={() => setConfirmBase(true)}>
                جایگزینی نقطهٔ شروع با خریدهای این دستگاه…
              </Button>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={async () => {
                    await replaceBaseline(acc.storedLots, acc.storedEntries, typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 60) : 'device');
                    setConfirmBase(false);
                    toast('success', 'نقطهٔ شروع خریدها جایگزین شد');
                  }}
                >
                  بله، جایگزین کن
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmBase(false)}>
                  انصراف
                </Button>
              </div>
            )}
          </Notice>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-ink">عملیاتی که هنوز در حسابداری حساب نشده‌اند ({toFaDigits(pendingByOp.length)})</h2>
        {pendingByOp.length === 0 ? (
          <p className="text-xs text-muted">همهٔ سواپ‌ها و بریج‌های تکمیل‌شده در حسابداری حساب شده‌اند.</p>
        ) : (
          <Surface className="divide-y divide-divider">
            {pendingByOp.map(([opId, reasons]) => {
              const op = custody.operations.find((o) => o.id === opId);
              return (
                <div key={opId} className="space-y-1 p-3 text-sm">
                  <p className="font-semibold text-ink">
                    {op ? KIND_META[op.kind].short : 'عملیات'} {op?.occurredAt ? `— ${fmtDateTime(op.occurredAt)}` : ''}
                  </p>
                  {reasons.map((r) => (
                    <p key={r} className="text-xs text-warn">
                      {r}
                    </p>
                  ))}
                </div>
              );
            })}
          </Surface>
        )}
        {pendingByOp.length > 0 && (
          <Link to="/holdings?tab=operations" className="text-sm text-accent hover:underline">
            رفتن به عملیات برای تکمیل
          </Link>
        )}
      </section>
    </div>
  );
}
