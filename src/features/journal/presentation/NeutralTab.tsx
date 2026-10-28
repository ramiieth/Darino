/**
 * تب «دلتا نوترال / فارم» — معیارهای درست این دفتر (نه نرخ برد): حجم برای پوینت، هزینه به‌ازای هر ۱ میلیون دلار حجم،
 * فاندینگ و کارمزد، تعادل پوشش‌ها. این دفتر هرگز با حسابرسی جهت‌دار قاطی نمی‌شود.
 */
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Notice } from '@/shared/components/ui/StateViews';
import { cn } from '@/shared/lib/cn';
import type { NeutralBook } from '../domain/neutral';
import { VENUE_FA, type AccountRole, type JournalAccount, type JournalSettings } from '../domain/types';
import { roleOf } from '../domain/classify';
import { saveSettings } from '../data/journalStore';
import { ChartBlock, duration, fa, faDateTime, pct, pnlTone, Term, usd } from './parts';
import { Bars } from './charts';

const compact = (v: number) => (Math.abs(v) >= 1e6 ? `$${fa(v / 1e6, 2)}M` : Math.abs(v) >= 1e3 ? `$${fa(v / 1e3, 1)}K` : usd(v));

/** انتخاب سریع: کدام پرپ‌ها در دفتر نوترال باشند (همان تنظیم «نقش حساب») */
function VenuePicker({ accounts, settings }: { accounts: JournalAccount[]; settings: JournalSettings }) {
  const set = (key: string, role: AccountRole | undefined) => void saveSettings({ ...settings, roles: { ...Object.fromEntries(Object.entries(settings.roles).filter(([k]) => k !== key)), ...(role ? { [key]: role } : {}) } });
  return (
    <Surface className="p-4 md:p-5">
      <h3 className="text-sm font-bold text-ink">کدام پرپ‌ها در این دفتر باشند</h3>
      <p className="mt-1 text-xs leading-6 text-muted">«نوترال» یعنی همهٔ معاملات حساب اینجا می‌آید (فارم پوینت، فاندینگ، حجم). «خودکار» یعنی فقط پاهایی که پای مخالف هم‌زمان روی حساب دیگر دارند. «جهت‌دار» یعنی هرگز اینجا نیاید.</p>
      {!accounts.length ? <p className="mt-2 text-xs text-subtle">هنوز حساب پرپی متصل نیست.</p> : (
        <div className="mt-2 divide-y divide-divider">
          {accounts.map((a) => {
            const role = roleOf(a.key, a.venue, settings.roles);
            return (
              <div key={a.key} className="flex flex-wrap items-center gap-2 py-2">
                <span className="text-sm text-ink">{a.label}</span>
                <Badge tone="neutral">{VENUE_FA[a.venue]}</Badge>
                <div className="ms-auto flex gap-1" role="group" aria-label={`نقش ${a.label}`}>
                  {(['neutral', 'auto', 'directional'] as const).map((r) => (
                    <button key={r} type="button" aria-pressed={role === r} onClick={() => set(a.key, r)} className={cn('rounded-full border px-2.5 py-1 text-xs', role === r ? 'border-accent bg-accent-soft text-accent' : 'border-divider text-muted')}>
                      {r === 'neutral' ? 'نوترال' : r === 'auto' ? 'خودکار' : 'جهت‌دار'}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-2 text-[11px] leading-5 text-subtle">اوندو پرپس هنوز تاریخچهٔ معامله به ژورنال نمی‌دهد (فقط موجودی و پوزیشن با کلید فقط‌خواندنی)؛ معاملاتش را می‌توانید در «معاملات» دستی ثبت کنید. تی‌اکس‌فلو فاندینگ عمومی ندارد.</p>
    </Surface>
  );
}

export function NeutralTab({ nb, fillDays, accounts, settings }: { nb: NeutralBook; fillDays: number; accounts: JournalAccount[]; settings: JournalSettings }) {
  if (!nb.accounts.length && !nb.hedges.length) return (
    <div className="space-y-4">
      <Notice tone="info">حساب یا معاملهٔ دلتا نوترالی در این بازه پیدا نشد. پرپ‌هایی را که برای دلتا نوترال استفاده می‌کنید پایین «نوترال» کنید (لایتر رابین‌هود و آرکوس به‌طور پیش‌فرض نوترال‌اند).</Notice>
      <VenuePicker accounts={accounts} settings={settings} />
    </div>
  );
  const t = nb.totals;
  return (
    <div className="space-y-5">
      <Surface variant="focal" className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-4">
        <div><p className="text-xs text-muted">حجم ساخته‌شده</p><p className="num-ltr text-2xl font-extrabold text-ink">{compact(t.volume)}</p></div>
        <div><p className="text-xs text-muted">فاندینگ دریافتی خالص</p><p className={cn('num-ltr text-2xl font-extrabold', pnlTone(t.funding))}>{usd(t.funding, true)}</p>{t.fundingPartial && <p className="text-[11px] text-subtle">بدون لایتر (عمومی نیست)</p>}</div>
        <div><p className="text-xs text-muted">کارمزد</p><p className="num-ltr text-2xl font-extrabold text-ink">{usd(-t.fees)}</p></div>
        <div><p className="text-xs text-muted"><Term id="costPerMillion">هزینه به‌ازای ۱M حجم</Term></p><p className={cn('num-ltr text-2xl font-extrabold', pnlTone(t.costPerMillion === null ? null : -t.costPerMillion))}>{t.costPerMillion === null ? '—' : usd(t.costPerMillion)}</p><p className="text-[11px] text-subtle">منفی = سود کردید</p></div>
      </Surface>
      {nb.platform && (
        <Surface className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-3"><p className="text-xs font-semibold text-ink">طبق سری روزانهٔ خود لایتر ({fa(nb.platform.accounts)} زیرحساب) — دقیق‌ترین منبع برای حساب‌های فارم</p></div>
          <div><p className="text-xs text-muted">حجم در بازه</p><p className="num-ltr text-xl font-extrabold text-ink">{compact(nb.platform.volume)}</p></div>
          <div><p className="text-xs text-muted">تغییر سود/زیان (با فاندینگ و سود باز)</p><p className={cn('num-ltr text-xl font-extrabold', pnlTone(nb.platform.pnlChange))}>{usd(nb.platform.pnlChange, true)}</p></div>
          <div><p className="text-xs text-muted">هزینه به‌ازای ۱M حجم</p><p className={cn('num-ltr text-xl font-extrabold', pnlTone(nb.platform.costPerMillion === null ? null : -nb.platform.costPerMillion))}>{nb.platform.costPerMillion === null ? '—' : usd(nb.platform.costPerMillion)}</p></div>
        </Surface>
      )}
      <p className="text-xs leading-6 text-muted">اعداد کارت بالا از اجراهاست: برای حساب‌های نوترال لایتر و هایپرلیکوئید فقط {fa(fillDays)} روز اخیر (برای جفت‌کردن پوشش‌ها؛ در تنظیمات قابل‌تغییر)، برای آرکوس کل تاریخچه. سود و زیان قیمتی پاها با فاندینگ و کارمزد جمع شده؛ سود باز پوزیشن‌های فعلی جزو آن نیست.</p>

      <Surface className="p-4 md:p-5">
        <h3 className="text-sm font-bold text-ink">هر حساب</h3>
        <div className="mt-2 divide-y divide-divider">
          {nb.accounts.map((a) => (
            <div key={a.account} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink">{a.label}</span>
                <Badge tone="info">{VENUE_FA[a.venue]}</Badge>
                <span className={cn('num-ltr ms-auto text-sm font-bold', pnlTone(a.net))}>{usd(a.net, true)}</span>
              </div>
              <p className="mt-1 text-xs leading-6 text-muted">
                حجم {compact(a.volume)} · {fa(a.trades)} معامله · {fa(a.activeDays)} روز فعال · کارمزد {a.fees === null ? 'گزارش نشده' : usd(a.fees)} · فاندینگ {a.funding === null ? 'عمومی نیست' : usd(a.funding, true)} · سود قیمتی بسته {usd(a.realized, true)}
                {a.costPerMillion !== null && ` · هر ۱M حجم ${usd(a.costPerMillion)}`}{a.openNotional > 0 && ` · پوزیشن باز ${compact(a.openNotional)}`}
              </p>
              {a.platform && (
                <p className="text-xs leading-6 text-ink">
                  طبق سری روزانهٔ خود لایتر ({fa(a.platform.days)} روز): تغییر سود/زیان معاملات {usd(a.platform.pnlChange, true)} (شامل فاندینگ و سود باز) · حجم {compact(a.platform.volume ?? 0)}
                </p>
              )}
            </div>
          ))}
        </div>
      </Surface>

      {nb.weeklyVolume.length > 1 && (
        <ChartBlock title="حجم هفتگی برای پوینت" term="حجم معاملات به تفکیک هفته" cls="context" caption={`بیشترین حجم: ${(() => { const w = nb.weeklyVolume.reduce((a, b) => (b.total > a.total ? b : a)); return `${w.week.replace(/^\d{4}-W/, 'هفتهٔ ')} با ${compact(w.total)}`; })()}. برنامه‌های پوینت معمولاً هفتگی محاسبه می‌شوند؛ هفتهٔ خالی یعنی امتیاز از دست رفته.`}>
          <Bars labels={nb.weeklyVolume.map((w) => w.week.replace(/^\d{4}-W/, 'W'))} values={nb.weeklyVolume.map((w) => w.total)} signed={false} height={180} />
        </ChartBlock>
      )}
      {nb.dailyNet.length > 2 && (
        <ChartBlock title="نتیجهٔ روزانهٔ پاهای بسته‌شده" term="سود و زیان روزانه (قیمت + فاندینگ − کارمزد)" cls="performance" caption={`${fa(nb.dailyNet.filter((d) => d.net < 0).length)} روز از ${fa(nb.dailyNet.length)} روز منفی. روزهای منفیِ پشت‌سرهم یعنی هزینهٔ چرخش یا اختلاف قیمت پاها از فاندینگ بیشتر بوده.`}>
          <Bars labels={nb.dailyNet.map((d) => d.day.slice(5))} values={nb.dailyNet.map((d) => d.net)} height={180} />
        </ChartBlock>
      )}

      <Surface className="p-4 md:p-5">
        <h3 className="text-sm font-bold text-ink">پوشش‌ها (جفت لانگ/شورت هم‌زمان)</h3>
        {!nb.hedges.length ? <p className="mt-1 text-xs text-muted">جفت پوششی پیدا نشد. اگر پاها روی حساب‌هایی هستند که متصل نیستند، آن حساب را اضافه کنید.</p> : (
          <div className="mt-2 divide-y divide-divider">
            {nb.hedges.slice(0, 20).map((h) => (
              <div key={h.id} className="py-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink" dir="ltr">{h.base}</span>
                  {h.open ? <Badge tone="warn">باز</Badge> : <Badge tone="neutral">بسته</Badge>}
                  <span className="text-muted">{faDateTime(h.start)} · {duration(h.days * 86_400_000)}</span>
                  <span className={cn('num-ltr ms-auto font-bold', pnlTone(h.net))}>{usd(h.net, true)}</span>
                </div>
                <p className="mt-1 leading-6 text-muted">
                  {h.legs.map((l) => `${VENUE_FA[l.venue]} ${l.direction === 'long' ? 'لانگ' : 'شورت'} ${compact(l.maxNotional)}`).join(' ↔ ')} · <Term id="imbalance">عدم‌تعادل</Term> <span className={(h.imbalancePct ?? 0) > 10 ? 'text-warn' : ''}>{pct(h.imbalancePct)}</span>
                  {h.funding !== null && ` · فاندینگ ${usd(h.funding, true)}`}{h.fees !== null && ` · کارمزد ${usd(h.fees)}`}{h.apr !== null && ` · بازده سالانه ${pct(h.apr)}`}
                </p>
                {(h.imbalancePct ?? 0) > 10 && <p className="text-warn">بیش از ۱۰٪ پوشش جهت‌دار مانده؛ این بخش در برابر حرکت قیمت بی‌دفاع است.</p>}
              </div>
            ))}
          </div>
        )}
        {nb.unpaired.length > 0 && (
          <Disclosure summary={`${fa(nb.unpaired.length)} معاملهٔ نوترال بدون جفت پیداشده`} className="mt-2">
            <p className="text-xs leading-6 text-muted">این‌ها به خاطر نقش حساب نوترال‌اند ولی پای مخالفشان در حساب‌های متصل دیده نشد (مثلاً پوشش روی صرافی دیگر یا معاملهٔ فارم حجم).</p>
            {nb.unpaired.slice(0, 30).map((t) => <p key={t.id} className="text-xs text-muted"><span dir="ltr">{t.symbol}</span> · {t.direction === 'long' ? 'لانگ' : 'شورت'} · {VENUE_FA[t.venue]} · {faDateTime(t.openTime)} · <span className={pnlTone(t.netPnl)}>{t.open ? 'باز' : usd(t.netPnl, true)}</span></p>)}
          </Disclosure>
        )}
      </Surface>
      <VenuePicker accounts={accounts} settings={settings} />
    </div>
  );
}
