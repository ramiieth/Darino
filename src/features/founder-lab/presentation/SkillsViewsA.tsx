import { useState, type FormEvent } from 'react';
import {
  analyzeCompetitors,
  buildSnapshot,
  computeBoard,
  computeCfo,
  computeOfferMetrics,
  formatMoney,
  formatNum,
  formatPct,
  generateConsumerPanel,
  getActiveVwData,
  parseNum,
  sanitizeUrl,
  summarizePanel,
  summarizeRealSurvey,
  todayIso,
  uid
} from '../domain/engines';
import { CURRENCIES, GLOSSARY, type CompetitorItem, type FounderLabProject, type FounderLabTab } from '../domain/types';
import { exportCsvFile } from '../infrastructure/founderLabRepo';
import { CfoMonthlyChart, PanelDistributionBar, VanWestendorpChart } from './FounderLabCharts';

export interface SkillViewProps {
  project: FounderLabProject;
  onUpdate: (updater: (p: FounderLabProject) => FounderLabProject, toast?: string) => void;
  onNavigate: (tab: FounderLabTab) => void;
}

const fieldCls =
  'w-full rounded-field border border-divider-strong bg-surface-2/40 px-3 py-2 text-sm text-ink placeholder:text-subtle focus:border-brand-500 focus:bg-card focus:outline-none';
const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 rounded-field bg-brand-500 px-3.5 py-2 text-sm font-semibold text-on-accent transition hover:bg-brand-600';
const btnSecondary =
  'inline-flex items-center justify-center gap-1.5 rounded-field border border-divider-strong bg-card px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-surface-2';

function HelpTip({ k }: { k: keyof typeof GLOSSARY }) {
  return (
    <span
      title={GLOSSARY[k]}
      className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-divider-strong bg-surface-2 text-[10px] font-bold text-muted"
    >
      ؟
    </span>
  );
}

/* =========================================================================
 * SKILL 1: FOUNDER BOARD
 * ========================================================================= */
export function BoardView({ project, onUpdate }: SkillViewProps) {
  const res = computeBoard(project);
  const verdictTone =
    res.verdict === 'go'
      ? 'bg-gain/15 text-positive border-gain/30'
      : res.verdict === 'no_go'
        ? 'bg-loss/15 text-negative border-loss/30'
        : 'bg-warn/15 text-warn border-warn/30';

  const setSlider = (lens: 'hormozi' | 'thiel' | 'jobs', key: string, val: number) => {
    onUpdate((p) => ({
      ...p,
      board: {
        ...p.board,
        [lens]: { ...p.board[lens], [key]: val },
        lastRunAt: new Date().toISOString()
      }
    }));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-field border border-info/30 bg-brand-50/60 p-3.5 text-sm text-ink">
        <strong>شفافیت چارچوب:</strong> این بخش از چارچوب‌های فکری منتشرشده Alex Hormozi (معادله ارزش)، Peter Thiel (بازار کوچک و تمایز) و چارچوب محصولی مرتبط با Steve Jobs (سادگی و تمرکز) الهام گرفته و ادعایی مبنی بر نظر واقعی این افراد ندارد.
      </div>

      <div className="glass rounded-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="t-title">جمع‌بندی هیئت‌مدیره</h2>
            <p className="t-caption text-muted">میانگین امتیاز سه دیدگاه مستقل بر اساس اطلاعات پروژه و معیارهای ارزیابی</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${verdictTone}`}>{res.verdictLabel}</span>
            <span className="t-figure">{formatNum(res.averageScore, 1)} / ۱۰</span>
          </div>
        </div>
        <ul className="mt-3 list-disc space-y-1 pr-5 text-sm text-muted">
          {res.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>

      <div className="glass rounded-card p-5">
        <h3 className="t-section mb-3">تنظیم دقیق شاخص‌های ارزیابی (به‌روزرسانی آنی)</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              lens: 'hormozi' as const,
              title: '۱. معادله ارزش (Hormozi)',
              fields: [
                ['dreamOutcome', 'جذابیت نتیجه نهایی'],
                ['perceivedLikelihood', 'اطمینان مشتری از نتیجه'],
                ['timeDelay', 'سرعت رسیدن به نتیجه'],
                ['effortEase', 'سادگی و کم‌زحمتی']
              ]
            },
            {
              lens: 'thiel' as const,
              title: '۲. مزیت و تمایز (Thiel)',
              fields: [
                ['smallMarketFocus', 'تمرکز بر بازار کوچک'],
                ['tenXAdvantage', 'برتری نسبت به جایگزین‌ها'],
                ['defensibility', 'سختی کپی‌برداری'],
                ['timingStrength', 'زمان‌بندی ورود به بازار']
              ]
            },
            {
              lens: 'jobs' as const,
              title: '۳. محصول و تجربه (Jobs)',
              fields: [
                ['simplicityFocus', 'تمرکز و سادگی محصول'],
                ['customerExperience', 'کیفیت کل تجربه مشتری'],
                ['clarityOfProblem', 'وضوح مسئله اصلی'],
                ['craftQuality', 'استاندارد کیفیت اجرا']
              ]
            }
          ].map((grp) => (
            <div key={grp.lens} className="space-y-2.5 rounded-field border border-divider bg-surface-2/40 p-3.5">
              <div className="text-sm font-bold text-brand-500">{grp.title}</div>
              {grp.fields.map(([k, lbl]) => {
                const v = (project.board[grp.lens] as unknown as Record<string, number>)[k] ?? 5;
                return (
                  <label key={k} className="block space-y-1 text-xs text-muted">
                    <div className="flex justify-between">
                      <span>{lbl}</span>
                      <strong className="text-ink">{formatNum(v)} / ۱۰</strong>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={v}
                      onChange={(e) => setSlider(grp.lens, k, Number(e.target.value))}
                      className="w-full accent-brand-500"
                    />
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {res.lenses.map((lens) => (
          <div key={lens.id} className="glass rounded-card p-5 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="t-section">{lens.title}</h3>
                <p className="t-caption text-muted">{lens.framework}</p>
              </div>
              <span className="badge bg-brand-50 text-brand-600">{formatNum(lens.score, 1)} / ۱۰</span>
            </div>
            <div className="space-y-2 text-xs leading-6">
              <div>
                <strong className="text-positive">نقاط قوت:</strong>
                <ul className="list-disc pr-4 text-muted">
                  {lens.strengths.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </div>
              <div>
                <strong className="text-negative">نقاط ضعف:</strong>
                <ul className="list-disc pr-4 text-muted">
                  {lens.weaknesses.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </div>
              <div>
                <strong className="text-ink">ریسک‌های اصلی:</strong>
                <ul className="list-disc pr-4 text-muted">
                  {lens.risks.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </div>
              <div>
                <strong className="text-ink">سؤالات بی‌پاسخ:</strong>
                <ul className="list-disc pr-4 text-muted">
                  {lens.questions.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </div>
              <div>
                <strong className="text-brand-500">پیشنهادهای اصلاحی:</strong>
                <ul className="list-disc pr-4 text-muted">
                  {lens.recommendations.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =========================================================================
 * SKILL 2: COMPETITOR ANALYSIS
 * ========================================================================= */
export function CompetitorsView({ project, onUpdate }: SkillViewProps) {
  const syn = analyzeCompetitors(project);
  const groupLabel: Record<CompetitorItem['group'], string> = {
    direct: 'رقیب مستقیم',
    indirect: 'رقیب غیرمستقیم',
    substitute: 'جایگزین فعلی مشتری'
  };

  const handleAdd = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') ?? '').trim();
    if (!name) return;
    const item: CompetitorItem = {
      id: uid('cmp'),
      name,
      group: (fd.get('group') as CompetitorItem['group']) || 'direct',
      website: String(fd.get('website') ?? '').trim(),
      sector: String(fd.get('sector') ?? '').trim(),
      products: String(fd.get('products') ?? '').trim(),
      price: parseNum(fd.get('price')),
      targetCustomers: String(fd.get('targetCustomers') ?? '').trim(),
      marketing: String(fd.get('marketing') ?? '').trim(),
      advantage: String(fd.get('advantage') ?? '').trim(),
      weakness: String(fd.get('weakness') ?? '').trim(),
      complaints: String(fd.get('complaints') ?? '').trim(),
      sourceUrl: String(fd.get('sourceUrl') ?? '').trim(),
      checkedDate: String(fd.get('checkedDate') ?? todayIso()),
      verified: fd.get('verified') === 'on'
    };
    onUpdate((p) => ({ ...p, competitors: [...p.competitors, item] }), 'رقیب جدید ثبت شد.');
    e.currentTarget.reset();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-field border border-warn/30 bg-warn/10 p-3.5 text-sm text-ink">
        <strong>شفافیت داده رقبا:</strong> این بخش هیچ قیمت یا نظری را به‌صورت زنده از وب اسکرپ نمی‌کند. اطلاعات تأییدنشده با برچسب «تأییدنشده» نمایش داده می‌شوند؛ برای تأیید، لینک منبع معتبر را ثبت کنید.
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="glass rounded-card p-4">
          <div className="t-caption text-muted">کل رقبا و جایگزین‌ها</div>
          <div className="t-figure mt-1">{formatNum(syn.total)}</div>
          <div className="t-caption mt-1 text-subtle">
            مستقیم: {formatNum(syn.counts.direct)} · غیرمستقیم: {formatNum(syn.counts.indirect)} · جایگزین: {formatNum(syn.counts.substitute)}
          </div>
        </div>
        <div className="glass rounded-card p-4">
          <div className="t-caption text-muted">میانگین قیمت رقبای مستقیم</div>
          <div className="t-figure-md mt-1">{syn.avgDirectPrice > 0 ? formatMoney(syn.avgDirectPrice, project.currency) : '—'}</div>
          <div className="t-caption mt-1 text-subtle">میانگین کل: {syn.avgAllPrice > 0 ? formatMoney(syn.avgAllPrice, project.currency) : '—'}</div>
        </div>
        <div className="glass rounded-card p-4">
          <div className="t-caption text-muted">شدت رقابت بازار</div>
          <div className="mt-1 text-sm font-bold text-ink">{syn.intensity}</div>
          <div className="t-caption mt-1 text-subtle">تأییدنشده: {formatNum(syn.unverifiedCount)} مورد</div>
        </div>
        <div className="glass rounded-card p-4">
          <div className="t-caption text-muted">جدی‌ترین تهدید رقابتی</div>
          <div className="mt-1 text-sm font-bold text-ink">{syn.topThreat?.name ?? '—'}</div>
          <div className="t-caption mt-1 text-subtle">{syn.topThreat ? groupLabel[syn.topThreat.group] : 'رقیبی ثبت نشده'}</div>
        </div>
      </div>

      <div className="glass rounded-card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="t-section">تحلیل و شکاف بازار</h3>
          <button
            type="button"
            className={btnSecondary}
            onClick={() =>
              exportCsvFile(
                `competitors-${todayIso()}.csv`,
                ['نام', 'گروه', 'حوزه', 'قیمت', 'مزیت', 'ضعف', 'شکایت مشتریان', 'منبع', 'تأییدشده'],
                project.competitors.map((c) => [c.name, groupLabel[c.group], c.sector, c.price, c.advantage, c.weakness, c.complaints, c.sourceUrl, c.verified ? 'بله' : 'خیر'])
              )
            }
          >
            خروجی CSV رقبا
          </button>
        </div>
        <div className="grid gap-4 text-sm md:grid-cols-2">
          <div>
            <strong>نیازهای برطرف‌نشده و نارضایتی‌ها:</strong>
            <ul className="mt-1 list-disc pr-5 text-muted">
              {syn.unmetNeeds.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </div>
          <div>
            <strong>فرصت تمایز کسب‌وکار جدید:</strong>
            <p className="mt-1 text-muted">{syn.differentiationOpportunity}</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleAdd} className="glass rounded-card grid gap-3 p-5 md:grid-cols-2">
        <h3 className="t-section md:col-span-2">افزودن رقیب یا جایگزین جدید</h3>
        <input name="name" required placeholder="نام رقیب / جایگزین *" className={fieldCls} />
        <select name="group" className={fieldCls}>
          <option value="direct">رقیب مستقیم</option>
          <option value="indirect">رقیب غیرمستقیم</option>
          <option value="substitute">جایگزین فعلی مشتری</option>
        </select>
        <input name="sector" placeholder="حوزه فعالیت" className={fieldCls} />
        <input name="price" type="number" min={0} step="any" placeholder={`قیمت (${CURRENCIES[project.currency].label})`} className={fieldCls} />
        <input name="products" placeholder="محصولات و خدمات" className={fieldCls} />
        <input name="targetCustomers" placeholder="مشتریان هدف" className={fieldCls} />
        <input name="advantage" placeholder="مزیت رقابتی" className={fieldCls} />
        <input name="weakness" placeholder="نقاط ضعف" className={fieldCls} />
        <input name="complaints" placeholder="شکایت‌های پرتکرار مشتریان" className={`${fieldCls} md:col-span-2`} />
        <input name="marketing" placeholder="روش فروش و بازاریابی" className={fieldCls} />
        <input name="sourceUrl" placeholder="لینک منبع اطلاعات (https://...)" className={fieldCls} />
        <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
            <input name="verified" type="checkbox" className="accent-brand-500" />
            اطلاعات مستقیماً از منبع معتبر بررسی و تأیید شده است
          </label>
          <button type="submit" className={btnPrimary}>افزودن رقیب</button>
        </div>
      </form>

      <div className="glass rounded-card p-5">
        <h3 className="t-section mb-3">فهرست رقبا و جایگزین‌ها</h3>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>نام و گروه</th>
                <th>قیمت</th>
                <th>مزیت و ضعف</th>
                <th>شکایت مشتریان</th>
                <th>منبع و وضعیت</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {project.competitors.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted">هنوز رقیبی ثبت نشده است.</td>
                </tr>
              ) : (
                project.competitors.map((c) => {
                  const src = sanitizeUrl(c.sourceUrl || c.website);
                  return (
                    <tr key={c.id}>
                      <td>
                        <div className="font-bold text-ink">{c.name}</div>
                        <span className="badge mt-1 bg-surface-2 text-muted">{groupLabel[c.group]}</span>
                      </td>
                      <td className="num-ltr">{c.price > 0 ? formatMoney(c.price, project.currency) : '—'}</td>
                      <td className="whitespace-normal text-xs">
                        <div><strong>مزیت:</strong> {c.advantage || '—'}</div>
                        <div><strong>ضعف:</strong> {c.weakness || '—'}</div>
                      </td>
                      <td className="whitespace-normal text-xs text-muted">{c.complaints || '—'}</td>
                      <td className="text-xs">
                        <span className={`badge ${c.verified && src ? 'bg-gain/15 text-positive' : 'bg-warn/15 text-warn'}`}>
                          {c.verified && src ? 'تأییدشده' : 'تأییدنشده'}
                        </span>
                        {src && (
                          <a href={src} target="_blank" rel="noopener noreferrer" className="mr-2 text-brand-500 underline">
                            منبع
                          </a>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={btnSecondary}
                          onClick={() => onUpdate((p) => ({ ...p, competitors: p.competitors.filter((x) => x.id !== c.id) }), 'رقیب حذف شد.')}
                        >
                          حذف
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
 * SKILL 3: CONSUMER PANEL (SIMULATED 20/50/100) + SEPARATED REAL SURVEY
 * ========================================================================= */
export function ConsumerPanelView({ project, onUpdate }: SkillViewProps) {
  const [subTab, setSubTab] = useState<'sim' | 'real'>('sim');
  const [filter, setFilter] = useState<'all' | 'buy' | 'maybe' | 'no'>('all');
  const [size, setSize] = useState<20 | 50 | 100>(project.panel.size);

  const summary = summarizePanel(project.panel.personas);
  const realSum = summarizeRealSurvey(project.realSurvey);

  const runPanel = (freshSeed: boolean) => {
    const nextSeed = freshSeed ? Math.floor(Math.random() * 900000) + 1000 : project.panel.seed;
    const personas = generateConsumerPanel(project, size, nextSeed);
    onUpdate(
      (p) => ({
        ...p,
        panel: {
          size,
          seed: nextSeed,
          personas,
          lastRunAt: new Date().toISOString(),
          lastRunNote: `اجرای پنل ${size} نفره`
        }
      }),
      `شبیه‌سازی الگوریتمی ${formatNum(size)} مشتری فرضی اجرا شد.`
    );
  };

  const handleAddReal = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const respondent = String(fd.get('respondent') ?? '').trim();
    if (!respondent) return;
    onUpdate(
      (p) => ({
        ...p,
        realSurvey: [
          ...p.realSurvey,
          {
            id: uid('real'),
            respondent,
            decision: (fd.get('decision') as 'buy' | 'maybe' | 'no') || 'maybe',
            vw: {
              tooCheap: parseNum(fd.get('tooCheap')),
              cheap: parseNum(fd.get('cheap')),
              expensive: parseNum(fd.get('expensive')),
              tooExpensive: parseNum(fd.get('tooExpensive'))
            },
            note: String(fd.get('note') ?? '').trim(),
            createdAt: new Date().toISOString()
          }
        ]
      }),
      'پاسخ نظرسنجی واقعی ثبت شد.'
    );
    e.currentTarget.reset();
  };

  const filtered = project.panel.personas.filter((p) => (filter === 'all' ? true : p.decision === filter));

  return (
    <div className="space-y-4">
      <div className="rounded-field border border-warn/30 bg-warn/10 p-3.5 text-sm text-ink">
        <strong>شبیه‌سازی الگوریتمی شفاف (نه مشتری واقعی و نه هوش مصنوعی):</strong> عدد مثلاً ۷۰ نفر از ۱۰۰ نفر در این پنل به معنای <strong>۷۰٪ احتمال واقعی فروش نیست</strong>؛ بلکه برای کشف اعتراض‌های محتمل و تست حساسیت قیمت و پیشنهاد است. برای اعتبارسنجی واقعی، نتایج نظرسنجی واقعی و پیش‌فروش را به‌صورت کاملاً تفکیک‌شده ثبت کنید.
      </div>

      <div className="flex flex-wrap gap-2 border-b border-divider pb-2">
        <button
          type="button"
          onClick={() => setSubTab('sim')}
          className={`rounded-field px-4 py-2 text-sm font-semibold transition ${
            subTab === 'sim' ? 'bg-brand-500 text-on-accent' : 'bg-surface-2 text-muted hover:text-ink'
          }`}
        >
          پنل شبیه‌سازی فرضی ({formatNum(summary.total)} نفر)
        </button>
        <button
          type="button"
          onClick={() => setSubTab('real')}
          className={`rounded-field px-4 py-2 text-sm font-semibold transition ${
            subTab === 'real' ? 'bg-gain text-on-accent' : 'bg-surface-2 text-muted hover:text-ink'
          }`}
        >
          نتایج نظرسنجی واقعی — تفکیک‌شده ({formatNum(realSum.total)} پاسخ)
        </button>
      </div>

      {subTab === 'sim' ? (
        <>
          <div className="glass rounded-card space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="t-title">پنل مشتریان فرضی</h2>
                  <span className="badge bg-brand-50 text-brand-600">شبیه‌سازی فرضی</span>
                  <HelpTip k="simulatedPanel" />
                </div>
                <p className="t-caption text-muted">
                  قیمت ملاک فعلی: <strong>{formatMoney(project.cfo.salePrice || project.profile.proposedPrice, project.currency)}</strong>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={size}
                  onChange={(e) => setSize(Number(e.target.value) as 20 | 50 | 100)}
                  className="rounded-field border border-divider-strong bg-card px-3 py-1.5 text-sm"
                >
                  <option value={20}>۲۰ مشتری فرضی</option>
                  <option value={50}>۵۰ مشتری فرضی</option>
                  <option value={100}>۱۰۰ مشتری فرضی</option>
                </select>
                <button type="button" className={btnPrimary} onClick={() => runPanel(false)}>
                  اجرای شبیه‌سازی
                </button>
                <button type="button" className={btnSecondary} onClick={() => runPanel(true)}>
                  نمونه جدید (Seed تازه)
                </button>
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() =>
                    exportCsvFile(
                      `simulated-panel-${todayIso()}.csv`,
                      ['ردیف', 'نام فرضی', 'سن', 'گروه', 'درآمد', 'حساسیت قیمت', 'اعتماد', 'تصمیم', 'امتیاز', 'اعتراض', 'عامل تغییر نظر', 'نوع داده'],
                      project.panel.personas.map((p) => [p.index, p.name, p.age, p.segment, p.income, p.priceSensitivity, p.trustLevel, p.decisionLabel, p.score, p.objection, p.flipFactor, 'شبیه‌سازی فرضی'])
                    )
                  }
                >
                  خروجی CSV
                </button>
              </div>
            </div>

            {summary.total > 0 && (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-field border border-divider bg-surface-2/40 p-3.5">
                    <div className="t-caption text-muted">تمایل به خرید (فرضی)</div>
                    <div className="t-figure mt-1 text-positive">{formatNum(summary.buyers)} نفر</div>
                    <div className="t-caption text-subtle">نرخ فرضی: {formatPct(summary.buyRate)}</div>
                  </div>
                  <div className="rounded-field border border-divider bg-surface-2/40 p-3.5">
                    <div className="t-caption text-muted">عدم خرید / مشروط</div>
                    <div className="t-figure-md mt-1 text-negative">{formatNum(summary.nonBuyers)} عدم خرید</div>
                    <div className="t-caption text-subtle">مشروط: {formatNum(summary.maybes)} نفر</div>
                  </div>
                  <div className="rounded-field border border-divider bg-surface-2/40 p-3.5">
                    <div className="t-caption text-muted">بهترین گروه مشتری</div>
                    <div className="mt-1 text-sm font-bold">{summary.topSegment?.segment ?? '—'}</div>
                    <div className="t-caption text-subtle">{summary.topSegment ? `${formatPct(summary.topSegment.buyRate)} تمایل فرضی` : ''}</div>
                  </div>
                  <div className="rounded-field border border-divider bg-surface-2/40 p-3.5">
                    <div className="t-caption text-muted">بازه قیمتی قابل‌قبول (میانه)</div>
                    <div className="mt-1 text-sm font-bold">
                      {formatMoney(summary.acceptableRange.min, project.currency)} تا {formatMoney(summary.acceptableRange.max, project.currency)}
                    </div>
                  </div>
                </div>

                <PanelDistributionBar buyers={summary.buyers} maybes={summary.maybes} nonBuyers={summary.nonBuyers} total={summary.total} />

                <div className="grid gap-4 text-sm md:grid-cols-2">
                  <div>
                    <strong>دلایل اصلی عدم خرید:</strong>
                    <ul className="mt-1 list-disc pr-5 text-muted">
                      {summary.topObjections.map((o, i) => (
                        <li key={i}>{o.text} ({formatNum(o.count)} نفر)</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <strong>عوامل تغییر نظر مشتری:</strong>
                    <ul className="mt-1 list-disc pr-5 text-muted">
                      {summary.topFlips.map((f, i) => (
                        <li key={i}>{f.text} ({formatNum(f.count)} نفر)</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </>
            )}
          </div>

          {summary.total > 0 && (
            <div className="glass rounded-card space-y-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="t-section">کارت‌های مستقل شخصیت‌های شبیه‌سازی‌شده ({formatNum(filtered.length)} مورد)</h3>
                <div className="flex flex-wrap gap-1.5">
                  {(['all', 'buy', 'maybe', 'no'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className={filter === f ? btnPrimary : btnSecondary}
                    >
                      {f === 'all' ? 'همه' : f === 'buy' ? 'خریدار' : f === 'maybe' ? 'مشروط' : 'عدم خرید'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filtered.map((p) => (
                  <div
                    key={p.id}
                    className={`rounded-field border border-divider bg-card p-3.5 text-xs leading-6 border-r-4 ${
                      p.decision === 'buy' ? 'border-r-gain' : p.decision === 'maybe' ? 'border-r-warn' : 'border-r-loss'
                    }`}
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <strong className="text-sm text-ink">
                        #{formatNum(p.index)} {p.name} ({formatNum(p.age)} ساله)
                      </strong>
                      <span
                        className={`badge ${
                          p.decision === 'buy' ? 'bg-gain/15 text-positive' : p.decision === 'maybe' ? 'bg-warn/15 text-warn' : 'bg-loss/15 text-negative'
                        }`}
                      >
                        {p.decisionLabel}
                      </span>
                    </div>
                    <div className="mb-1.5 flex gap-1.5">
                      <span className="badge bg-brand-50 text-brand-600">شبیه‌سازی فرضی</span>
                      <span className="badge bg-surface-2 text-muted">{p.segment}</span>
                    </div>
                    <div className="text-muted">
                      <div><strong>درآمد / مالی:</strong> {p.income} — {p.financialStatus}</div>
                      <div><strong>رفتار خرید:</strong> {p.buyingBehavior}</div>
                      <div><strong>حساسیت قیمت:</strong> {formatNum(p.priceSensitivity)}/۱۰ · <strong>اعتماد:</strong> {formatNum(p.trustLevel)}/۱۰ · <strong>امتیاز:</strong> {formatNum(p.score, 1)}/۱۰</div>
                      <div><strong>جایگزین فعلی:</strong> {p.currentSubstitute}</div>
                      <div><strong>اعتراض اصلی:</strong> {p.objection}</div>
                      <div><strong>عامل تغییر نظر:</strong> {p.flipFactor}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="glass rounded-card space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="t-title">نتایج نظرسنجی واقعی <span className="badge bg-gain/15 text-positive">جدا از شبیه‌سازی</span></h2>
              <p className="t-caption text-muted">پاسخ‌های مصاحبه یا فرم واقعی مشتریان را ثبت کنید تا مستقیماً در Van Westendorp واقعی محاسبه شوند.</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-field border border-divider bg-surface-2/40 p-3.5">
              <div className="t-caption text-muted">نرخ تمایل در نظرسنجی واقعی</div>
              <div className="t-figure mt-1 text-positive">{realSum.total > 0 ? formatPct(realSum.buyRate) : 'ثبت نشده'}</div>
              <div className="t-caption text-subtle">{formatNum(realSum.buyers)} خریدار از {formatNum(realSum.total)} پاسخ واقعی</div>
            </div>
            <div className="rounded-field border border-divider bg-surface-2/40 p-3.5">
              <div className="t-caption text-muted">مقایسه با پنل شبیه‌سازی فرضی</div>
              <div className="t-figure mt-1">{summary.total > 0 ? formatPct(summary.buyRate) : '—'}</div>
              <div className="t-caption text-subtle">معیار تصمیم نهایی همیشه رفتار و پرداخت واقعی است</div>
            </div>
          </div>

          <form onSubmit={handleAddReal} className="grid gap-3 md:grid-cols-2">
            <input name="respondent" required placeholder="نام یا کد مصاحبه‌شونده واقعی *" className={fieldCls} />
            <select name="decision" className={fieldCls}>
              <option value="buy">مایل به خرید / پیش‌پرداخت</option>
              <option value="maybe">مشروط</option>
              <option value="no">عدم خرید</option>
            </select>
            <input name="tooCheap" type="number" min={0} step="any" placeholder="قیمت خیلی ارزان (مشکوک)" className={fieldCls} />
            <input name="cheap" type="number" min={0} step="any" placeholder="قیمت مقرون‌به‌صرفه" className={fieldCls} />
            <input name="expensive" type="number" min={0} step="any" placeholder="قیمت گران" className={fieldCls} />
            <input name="tooExpensive" type="number" min={0} step="any" placeholder="قیمت خیلی گران (عدم خرید)" className={fieldCls} />
            <input name="note" placeholder="نقل‌قول یا دلیل واقعی مشتری" className={`${fieldCls} md:col-span-2`} />
            <div className="flex justify-end md:col-span-2">
              <button type="submit" className={btnPrimary}>ثبت پاسخ واقعی</button>
            </div>
          </form>

          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr><th>پاسخ‌دهنده</th><th>تصمیم</th><th>۴ قیمت Van Westendorp</th><th>یادداشت</th><th>حذف</th></tr>
              </thead>
              <tbody>
                {project.realSurvey.length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-muted">هنوز پاسخ واقعی ثبت نشده است.</td></tr>
                ) : (
                  project.realSurvey.map((r) => (
                    <tr key={r.id}>
                      <td className="font-semibold">{r.respondent}</td>
                      <td>
                        <span className={`badge ${r.decision === 'buy' ? 'bg-gain/15 text-positive' : r.decision === 'maybe' ? 'bg-warn/15 text-warn' : 'bg-loss/15 text-negative'}`}>
                          {r.decision === 'buy' ? 'خریدار' : r.decision === 'maybe' ? 'مشروط' : 'عدم خرید'}
                        </span>
                      </td>
                      <td className="num-ltr text-xs">
                        {r.vw.tooCheap > 0 ? `${formatNum(r.vw.tooCheap)} / ${formatNum(r.vw.cheap)} / ${formatNum(r.vw.expensive)} / ${formatNum(r.vw.tooExpensive)}` : '—'}
                      </td>
                      <td className="whitespace-normal text-xs text-muted">{r.note || '—'}</td>
                      <td>
                        <button type="button" className={btnSecondary} onClick={() => onUpdate((p) => ({ ...p, realSurvey: p.realSurvey.filter((x) => x.id !== r.id) }))}>
                          حذف
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
 * SKILL 4: PRICING STRATEGIST (VAN WESTENDORP + 3 TIERS)
 * ========================================================================= */
export function PricingView({ project, onUpdate }: SkillViewProps) {
  const curPrice = parseNum(project.cfo.salePrice || project.profile.proposedPrice);
  const [priceDraft, setPriceDraft] = useState(String(curPrice));
  const vwData = getActiveVwData(project);
  const cfo = computeCfo(project);
  const comp = analyzeCompetitors(project);
  const lossDanger = curPrice > 0 && cfo.contributionUnit <= 0;

  const applyPrice = () => {
    const val = parseNum(priceDraft);
    onUpdate((p) => {
      const next: FounderLabProject = {
        ...p,
        profile: { ...p.profile, proposedPrice: val },
        cfo: { ...p.cfo, salePrice: val }
      };
      next.snapshots = [buildSnapshot(next, `تغییر قیمت به ${formatMoney(val, p.currency)}`), ...p.snapshots].slice(0, 30);
      return next;
    }, 'قیمت جدید اعمال و در CFO به‌روزرسانی شد.');
  };

  return (
    <div className="space-y-4">
      <div className="glass rounded-card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="t-title">تحلیل حساسیت قیمتی Van Westendorp</h2>
              <HelpTip k="vanWestendorp" />
            </div>
            <p className="t-caption mt-1 text-muted">
              منبع فعال:{' '}
              <span className={`badge ${vwData.isSimulated ? 'bg-brand-50 text-brand-600' : 'bg-gain/15 text-positive'}`}>
                {vwData.isSimulated ? `شبیه‌سازی فرضی (${formatNum(vwData.simCount)})` : `نظرسنجی واقعی (${formatNum(vwData.realCount)})`}
              </span>
            </p>
          </div>
          <select
            value={project.pricing.dataSource}
            onChange={(e) =>
              onUpdate((p) => ({ ...p, pricing: { ...p.pricing, dataSource: e.target.value as 'auto' | 'real' | 'simulated' } }))
            }
            className="rounded-field border border-divider-strong bg-card px-3 py-1.5 text-xs"
          >
            <option value="auto">خودکار (اولویت با نظرسنجی واقعی)</option>
            <option value="real">فقط نظرسنجی واقعی ({formatNum(vwData.realCount)})</option>
            <option value="simulated">فقط شبیه‌سازی فرضی ({formatNum(vwData.simCount)})</option>
          </select>
        </div>

        {lossDanger && (
          <div className="rounded-field border border-loss/40 bg-loss/10 p-3.5 text-sm font-semibold text-negative">
            هشدار زیان‌دهی: قیمت فعلی ({formatMoney(curPrice, project.currency)}) از هزینه متغیر واحد ({formatMoney(cfo.totalVarUnit, project.currency)}) کمتر یا مساوی است؛ فروش بیشتر باعث زیان بیشتر می‌شود!
          </div>
        )}

        <div className="grid gap-3 rounded-field bg-surface-2/60 p-3.5 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">قیمت پیشنهادی فعلی (همگام با CFO)</label>
            <div className="flex gap-2">
              <input type="number" min={0} step="any" value={priceDraft} onChange={(e) => setPriceDraft(e.target.value)} className={fieldCls} />
              <button type="button" onClick={applyPrice} className={btnPrimary}>اعمال</button>
            </div>
          </div>
          <div className="flex flex-col justify-center text-xs text-muted space-y-1">
            <div>هزینه متغیر واحد (CFO): <strong className="text-ink">{formatMoney(cfo.totalVarUnit, project.currency)}</strong></div>
            <div>میانگین رقبای مستقیم: <strong className="text-ink">{comp.avgDirectPrice > 0 ? formatMoney(comp.avgDirectPrice, project.currency) : 'ثبت نشده'}</strong></div>
            <div>سود مشارکت هر واحد: <strong className={cfo.contributionUnit > 0 ? 'text-positive' : 'text-negative'}>{formatMoney(cfo.contributionUnit, project.currency)}</strong></div>
          </div>
        </div>

        {vwData.vw.valid ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { lbl: 'PMC (کف ارزانی مشکوک)', v: vwData.vw.pmc, cls: 'text-ink' },
                { lbl: 'OPP (قیمت بهینه)', v: vwData.vw.opp, cls: 'text-positive' },
                { lbl: 'IPP (نقطه بی‌تفاوتی)', v: vwData.vw.ipp, cls: 'text-ink' },
                { lbl: 'PME (سقف گرانی)', v: vwData.vw.pme, cls: 'text-warn' }
              ].map((k) => (
                <div key={k.lbl} className="rounded-field border border-divider bg-surface-2/40 p-3.5">
                  <div className="t-caption text-muted">{k.lbl}</div>
                  <div className={`t-figure-md mt-1 ${k.cls}`}>{formatMoney(k.v, project.currency)}</div>
                </div>
              ))}
            </div>
            <VanWestendorpChart vw={vwData.vw} proposedPrice={curPrice} currency={project.currency} />
          </>
        ) : (
          <div className="rounded-field border border-warn/30 bg-warn/10 p-3.5 text-sm text-ink">{vwData.vw.reason}</div>
        )}
      </div>

      <div className="glass rounded-card p-5">
        <h3 className="t-section mb-3">سه سطح قیمت‌گذاری (اقتصادی / استاندارد / حرفه‌ای)</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {project.pricing.tiers.map((t, idx) => {
            const margin = t.price - t.unitCost;
            const pct = t.price > 0 ? (margin / t.price) * 100 : 0;
            const updateTier = (field: 'name' | 'price' | 'unitCost' | 'features', val: string | number) => {
              onUpdate((p) => {
                const next = [...p.pricing.tiers];
                next[idx] = { ...next[idx], [field]: val };
                return { ...p, pricing: { ...p.pricing, tiers: next } };
              });
            };
            return (
              <div key={t.id} className={`space-y-2.5 rounded-field border p-4 ${margin <= 0 && t.price > 0 ? 'border-loss' : 'border-divider'}`}>
                <input value={t.name} onChange={(e) => updateTier('name', e.target.value)} className={fieldCls} />
                <input type="number" min={0} value={t.price} onChange={(e) => updateTier('price', parseNum(e.target.value))} placeholder="قیمت فروش" className={fieldCls} />
                <input type="number" min={0} value={t.unitCost} onChange={(e) => updateTier('unitCost', parseNum(e.target.value))} placeholder="هزینه متغیر واحد" className={fieldCls} />
                <textarea value={t.features} onChange={(e) => updateTier('features', e.target.value)} rows={2} className={fieldCls} />
                <div className="border-t border-divider pt-2 text-xs">
                  سود هر واحد:{' '}
                  <strong className={margin > 0 ? 'text-positive' : 'text-negative'}>
                    {formatMoney(margin, project.currency)} ({formatPct(pct)})
                  </strong>
                  {margin <= 0 && t.price > 0 && <div className="mt-1 font-bold text-negative">هشدار: این پلن زیان‌ده است!</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
 * SKILL 5: OFFER ARCHITECT
 * ========================================================================= */
export function OfferView({ project, onUpdate, onNavigate }: SkillViewProps) {
  const o = project.offer;
  const metrics = computeOfferMetrics(project);
  const cfo = computeCfo(project);
  const panel = summarizePanel(project.panel.personas);

  const handleSaveOffer = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onUpdate(
      (p) => ({
        ...p,
        offer: {
          ...p.offer,
          coreProblem: String(fd.get('coreProblem') ?? '').trim(),
          desiredOutcome: String(fd.get('desiredOutcome') ?? '').trim(),
          mainBarriers: String(fd.get('mainBarriers') ?? '').trim(),
          competitiveEdge: String(fd.get('competitiveEdge') ?? '').trim(),
          guarantee: String(fd.get('guarantee') ?? '').trim(),
          launchOffer: String(fd.get('launchOffer') ?? '').trim(),
          applyOfferCostToCfo: fd.get('applyOfferCostToCfo') === 'on'
        }
      }),
      'ساختار پیشنهاد فروش ذخیره شد.'
    );
  };

  const handleAddItem = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get('title') ?? '').trim();
    if (!title) return;
    onUpdate(
      (p) => ({
        ...p,
        offer: {
          ...p.offer,
          items: [
            ...p.offer.items,
            {
              id: uid('off'),
              title,
              valueScore: Math.max(1, Math.min(10, parseNum(fd.get('valueScore'), 8))),
              costPerUnit: parseNum(fd.get('costPerUnit'))
            }
          ]
        }
      }),
      'آیتم جدید به پیشنهاد اضافه شد.'
    );
    e.currentTarget.reset();
  };

  const rerunPanelWithOffer = () => {
    onUpdate((p) => {
      const personas = generateConsumerPanel(p, p.panel.size, p.panel.seed);
      const next: FounderLabProject = {
        ...p,
        panel: { ...p.panel, personas, lastRunAt: new Date().toISOString() }
      };
      next.snapshots = [buildSnapshot(next, 'بازآزمایی پنل پس از اصلاح پیشنهاد فروش'), ...p.snapshots].slice(0, 30);
      return next;
    }, 'پنل مشتریان با پیشنهاد جدید بازآزمایی و نسخه مقایسه ثبت شد.');
    onNavigate('panel');
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="glass rounded-card p-4">
          <div className="t-caption text-muted">اجزای تکمیلی پیشنهاد</div>
          <div className="t-figure mt-1">{formatNum(metrics.itemCount)} مورد</div>
          <div className="t-caption text-subtle">میانگین ارزش: {formatNum(metrics.avgValueScore, 1)} / ۱۰</div>
        </div>
        <div className="glass rounded-card p-4">
          <div className="t-caption text-muted">هزینه اجرای پیشنهاد (هر واحد)</div>
          <div className="t-figure-md mt-1">{formatMoney(metrics.totalCostPerUnit, project.currency)}</div>
          <div className="t-caption text-subtle">{o.applyOfferCostToCfo ? 'در CFO محاسبه شده' : 'در CFO لحاظ نشده'}</div>
        </div>
        <div className="glass rounded-card p-4">
          <div className="t-caption text-muted">سود مشارکت پس از پیشنهاد</div>
          <div className={`t-figure-md mt-1 ${cfo.contributionUnit > 0 ? 'text-positive' : 'text-negative'}`}>
            {formatMoney(cfo.contributionUnit, project.currency)}
          </div>
          <div className="t-caption text-subtle">حاشیه: {formatPct(cfo.contributionMarginPct)}</div>
        </div>
      </div>

      {panel.topObjections.length > 0 && (
        <div className="glass rounded-card p-4 text-sm">
          <strong>پرتکرارترین اعتراض‌های پنل مشتریان (مبنای اصلاح پیشنهاد):</strong>
          <ul className="mt-1 list-disc pr-5 text-muted">
            {panel.topObjections.map((x, i) => <li key={i}>{x.text}</li>)}
          </ul>
        </div>
      )}

      <form onSubmit={handleSaveOffer} className="glass rounded-card space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="t-title">طراحی پیشنهاد فروش (بدون تخفیف ساختگی و فوریت جعلی)</h2>
          <button type="button" onClick={rerunPanelWithOffer} className={btnPrimary}>
            بازآزمایی پنل با این پیشنهاد و ثبت نسخه
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <textarea name="coreProblem" defaultValue={o.coreProblem} placeholder="مشکل اصلی مشتری" rows={2} className={fieldCls} />
          <textarea name="desiredOutcome" defaultValue={o.desiredOutcome} placeholder="نتیجه‌ای که مشتری می‌خواهد" rows={2} className={fieldCls} />
          <textarea name="mainBarriers" defaultValue={o.mainBarriers} placeholder="موانع خرید" rows={2} className={fieldCls} />
          <textarea name="competitiveEdge" defaultValue={o.competitiveEdge} placeholder="مزایای رقابتی" rows={2} className={fieldCls} />
          <textarea name="guarantee" defaultValue={o.guarantee} placeholder="ضمانت منطقی و قابل‌اجرا" rows={2} className={fieldCls} />
          <textarea name="launchOffer" defaultValue={o.launchOffer} placeholder="پیشنهاد افتتاحیه واقعی" rows={2} className={fieldCls} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
            <input name="applyOfferCostToCfo" type="checkbox" defaultChecked={o.applyOfferCostToCfo} className="accent-brand-500" />
            هزینه اجرای پیشنهاد به‌صورت خودکار در هزینه متغیر CFO محاسبه شود
          </label>
          <button type="submit" className={btnPrimary}>ذخیره پیشنهاد</button>
        </div>
      </form>

      <div className="glass rounded-card space-y-3 p-5">
        <h3 className="t-section">ماتریس ارزش برای مشتری در برابر هزینه اجرا</h3>
        <form onSubmit={handleAddItem} className="grid gap-3 md:grid-cols-4">
          <input name="title" required placeholder="ویژگی، پاداش یا خدمت تکمیلی *" className={`${fieldCls} md:col-span-2`} />
          <input name="valueScore" type="number" min={1} max={10} defaultValue={8} placeholder="ارزش ۱ تا ۱۰" className={fieldCls} />
          <div className="flex gap-2">
            <input name="costPerUnit" type="number" min={0} step="any" defaultValue={0} placeholder="هزینه هر واحد" className={fieldCls} />
            <button type="submit" className={btnPrimary}>+</button>
          </div>
        </form>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr><th>عنوان</th><th>ارزش برای مشتری</th><th>هزینه هر واحد</th><th>حذف</th></tr>
            </thead>
            <tbody>
              {o.items.map((it) => (
                <tr key={it.id}>
                  <td className="font-semibold">{it.title}</td>
                  <td>{formatNum(it.valueScore)} / ۱۰</td>
                  <td className="num-ltr">{formatMoney(it.costPerUnit, project.currency)}</td>
                  <td>
                    <button
                      type="button"
                      className={btnSecondary}
                      onClick={() => onUpdate((p) => ({ ...p, offer: { ...p.offer, items: p.offer.items.filter((x) => x.id !== it.id) } }))}
                    >
                      حذف
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
 * SKILL 6: CFO UNIT ECONOMICS & 12-MONTH MODEL
 * ========================================================================= */
export function CfoView({ project, onUpdate }: SkillViewProps) {
  const c = project.cfo;
  const r = computeCfo(project);

  const handleSave = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const forecast = Array.from({ length: 12 }, (_, i) => Math.max(0, parseNum(fd.get(`m_${i}`))));
    const salePrice = parseNum(fd.get('salePrice'));
    const initialCapital = parseNum(fd.get('initialCapital'));
    onUpdate(
      (p) => ({
        ...p,
        profile: { ...p.profile, proposedPrice: salePrice, initialCapital },
        cfo: {
          ...p.cfo,
          salePrice,
          variableCostPerUnit: parseNum(fd.get('variableCostPerUnit')),
          packagingShippingCost: parseNum(fd.get('packagingShippingCost')),
          commissionPercent: parseNum(fd.get('commissionPercent')),
          rent: parseNum(fd.get('rent')),
          salaries: parseNum(fd.get('salaries')),
          softwareServices: parseNum(fd.get('softwareServices')),
          otherFixed: parseNum(fd.get('otherFixed')),
          initialCapital,
          dailyCapacity: parseNum(fd.get('dailyCapacity')),
          workingDaysPerMonth: Math.max(1, parseNum(fd.get('workingDaysPerMonth'), 26)),
          monthlyForecast: forecast
        }
      }),
      'محاسبات مدیر مالی (CFO) به‌روزرسانی شد.'
    );
  };

  return (
    <div className="space-y-4">
      {!r.isComplete && (
        <div className="rounded-field border border-warn/30 bg-warn/10 p-3.5 text-sm">
          <strong>ورودی‌های ناقص:</strong> برای محاسبه بدون تخمین ساختگی، این موارد را تکمیل کنید: <strong>{r.missingFields.join('، ')}</strong>
        </div>
      )}
      {r.salePrice > 0 && r.contributionUnit <= 0 && (
        <div className="rounded-field border border-loss/40 bg-loss/10 p-3.5 text-sm font-semibold text-negative">
          هشدار بحرانی: سود مشارکت هر واحد صفر یا منفی است ({formatMoney(r.contributionUnit, project.currency)}).
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="glass rounded-card p-4">
          <div className="t-caption flex items-center gap-1 text-muted">سود مشارکت هر واحد <HelpTip k="contributionMargin" /></div>
          <div className={`t-figure-md mt-1 ${r.contributionUnit > 0 ? 'text-positive' : 'text-negative'}`}>
            {formatMoney(r.contributionUnit, project.currency)}
          </div>
          <div className="t-caption text-subtle">حاشیه: {formatPct(r.contributionMarginPct)}</div>
        </div>
        <div className="glass rounded-card p-4">
          <div className="t-caption flex items-center gap-1 text-muted">نقطه سربه‌سر <HelpTip k="breakEven" /></div>
          <div className={`t-figure-md mt-1 ${r.fitsCapacity ? 'text-positive' : r.dailyCapacity > 0 ? 'text-negative' : 'text-ink'}`}>
            {Number.isFinite(r.breakEvenUnitsMonthly) ? `${formatNum(r.breakEvenUnitsMonthly)} / ماه` : 'ناممکن'}
          </div>
          <div className="t-caption text-subtle">
            روزانه: {Number.isFinite(r.breakEvenUnitsDaily) ? `${formatNum(r.breakEvenUnitsDaily, 1)} واحد` : '—'}
          </div>
        </div>
        <div className="glass rounded-card p-4">
          <div className="t-caption text-muted">سود عملیاتی سال اول</div>
          <div className={`t-figure-md mt-1 ${r.year1OperatingProfit > 0 ? 'text-positive' : 'text-negative'}`}>
            {formatMoney(r.year1OperatingProfit, project.currency)}
          </div>
          <div className="t-caption text-subtle">حاشیه خالص: {formatPct(r.year1NetMarginPct)}</div>
        </div>
        <div className="glass rounded-card p-4">
          <div className="t-caption flex items-center gap-1 text-muted">نقدینگی کل لازم <HelpTip k="peakCash" /></div>
          <div className="t-figure-md mt-1">{formatMoney(r.totalCapitalNeeded, project.currency)}</div>
          <div className="t-caption text-subtle">
            بازگشت سرمایه: {r.paybackMonth !== null ? `ماه ${formatNum(r.paybackMonth, 1)}` : '> ۱۲ ماه'}
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="glass rounded-card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="t-title">ورودی‌های مالی ({CURRENCIES[project.currency].label})</h2>
          <button
            type="button"
            className={btnSecondary}
            onClick={() =>
              exportCsvFile(
                `cfo-12months-${todayIso()}.csv`,
                ['ماه', 'فروش', 'درآمد', 'هزینه متغیر', 'سود ناخالص', 'هزینه ثابت', 'سود عملیاتی', 'نقدینگی تجمعی'],
                r.months.map((m) => [m.month, m.units, m.revenue, m.varCost, m.grossProfit, m.fixedCost, m.opProfit, m.cumCash])
              )
            }
          >
            خروجی CSV ۱۲ ماهه
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['salePrice', 'قیمت فروش هر واحد', c.salePrice || project.profile.proposedPrice],
            ['variableCostPerUnit', 'هزینه متغیر تولید/خرید', c.variableCostPerUnit],
            ['packagingShippingCost', 'بسته‌بندی و ارسال', c.packagingShippingCost],
            ['commissionPercent', 'کمیسیون و کارمزد (٪)', c.commissionPercent],
            ['rent', 'اجاره ماهانه', c.rent],
            ['salaries', 'حقوق ماهانه', c.salaries],
            ['softwareServices', 'نرم‌افزار و خدمات ماهانه', c.softwareServices],
            ['otherFixed', 'سایر هزینه‌های ثابت', c.otherFixed],
            ['initialCapital', 'سرمایه اولیه', c.initialCapital || project.profile.initialCapital],
            ['dailyCapacity', 'ظرفیت فروش روزانه', c.dailyCapacity],
            ['workingDaysPerMonth', 'روز کاری در ماه', c.workingDaysPerMonth]
          ].map(([name, label, val]) => (
            <label key={String(name)} className="block space-y-1 text-xs text-muted">
              <span>{label}</span>
              <input name={String(name)} type="number" min={0} step="any" defaultValue={Number(val)} className={fieldCls} />
            </label>
          ))}
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold text-muted">پیش‌بینی فروش ۱۲ ماهه (تعداد واحد در هر ماه)</div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {Array.from({ length: 12 }, (_, i) => (
              <label key={i} className="block text-2xs text-subtle">
                ماه {formatNum(i + 1)}
                <input name={`m_${i}`} type="number" min={0} defaultValue={c.monthlyForecast[i] ?? 0} className={`${fieldCls} mt-0.5`} />
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" className={btnPrimary}>به‌روزرسانی محاسبات مالی</button>
        </div>
      </form>

      <div className="glass rounded-card p-5">
        <h3 className="t-section mb-3">نمودار سود عملیاتی ماهانه و جریان نقد تجمعی</h3>
        <CfoMonthlyChart cfo={r} currency={project.currency} />
      </div>

      <div className="glass rounded-card p-5">
        <h3 className="t-section mb-3">تست استرس — مقایسه ۳ سناریوی ریسک</h3>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr><th>سناریو</th><th>سود مشارکت واحد</th><th>سربه‌سر روزانه</th><th>سود عملیاتی سال اول</th><th>حاشیه خالص</th><th>نقدینگی لازم</th><th>بازگشت سرمایه</th></tr>
            </thead>
            <tbody>
              <tr className="bg-surface-2/40 font-bold">
                <td>حالت پایه (فعلی)</td>
                <td className="num-ltr">{formatMoney(r.contributionUnit, project.currency)}</td>
                <td className="num-ltr">{Number.isFinite(r.breakEvenUnitsDaily) ? formatNum(r.breakEvenUnitsDaily, 1) : '—'}</td>
                <td className={`num-ltr ${r.year1OperatingProfit > 0 ? 'text-positive' : 'text-negative'}`}>{formatMoney(r.year1OperatingProfit, project.currency)}</td>
                <td className="num-ltr">{formatPct(r.year1NetMarginPct)}</td>
                <td className="num-ltr">{formatMoney(r.totalCapitalNeeded, project.currency)}</td>
                <td>{r.paybackMonth !== null ? `ماه ${formatNum(r.paybackMonth, 1)}` : '> ۱۲ ماه'}</td>
              </tr>
              {r.scenarios.map((sc) => (
                <tr key={sc.id}>
                  <td>{sc.title}</td>
                  <td className="num-ltr">{formatMoney(sc.result.contributionUnit, project.currency)}</td>
                  <td className="num-ltr">{Number.isFinite(sc.result.breakEvenUnitsDaily) ? formatNum(sc.result.breakEvenUnitsDaily, 1) : 'ناممکن'}</td>
                  <td className={`num-ltr ${sc.result.year1OperatingProfit > 0 ? 'text-positive' : 'text-negative'}`}>{formatMoney(sc.result.year1OperatingProfit, project.currency)}</td>
                  <td className="num-ltr">{formatPct(sc.result.year1NetMarginPct)}</td>
                  <td className="num-ltr">{formatMoney(sc.result.totalCapitalNeeded, project.currency)}</td>
                  <td>{sc.result.paybackMonth !== null ? `ماه ${formatNum(sc.result.paybackMonth, 1)}` : '> ۱۲ ماه'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass rounded-card p-5">
        <h3 className="t-section mb-3">جدول سود و زیان ۱۲ ماهه</h3>
        <div className="overflow-x-auto">
          <table className="data-table is-compact">
            <thead>
              <tr><th>ماه</th><th>فروش</th><th>درآمد ناخالص</th><th>هزینه متغیر</th><th>سود ناخالص</th><th>هزینه ثابت</th><th>سود/زیان ماهانه</th><th>نقدینگی تجمعی</th></tr>
            </thead>
            <tbody>
              {r.months.map((m) => (
                <tr key={m.month}>
                  <td>ماه {formatNum(m.month)}</td>
                  <td className="num-ltr">{formatNum(m.units)}</td>
                  <td className="num-ltr">{formatMoney(m.revenue, project.currency)}</td>
                  <td className="num-ltr">{formatMoney(m.varCost, project.currency)}</td>
                  <td className="num-ltr">{formatMoney(m.grossProfit, project.currency)}</td>
                  <td className="num-ltr">{formatMoney(m.fixedCost, project.currency)}</td>
                  <td className={`num-ltr ${m.opProfit >= 0 ? 'text-positive' : 'text-negative'}`}>{formatMoney(m.opProfit, project.currency)}</td>
                  <td className={`num-ltr ${m.cumCash >= 0 ? 'text-positive' : 'text-negative'}`}>{formatMoney(m.cumCash, project.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
