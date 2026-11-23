import type { FormEvent } from 'react';
import {
  analyzeCompetitors,
  buildSnapshot,
  computeBoard,
  computeBusinessPlanStatus,
  computeCfo,
  computeOpsCosts,
  formatMoney,
  formatNum,
  formatPct,
  getActiveVwData,
  parseNum,
  summarizePanel,
  summarizeRealSurvey,
  uid
} from '../domain/engines';
import type { FounderLabProject } from '../domain/types';
import type { SkillViewProps } from './SkillsViewsA';

const fieldCls =
  'w-full rounded-field border border-divider-strong bg-surface-2/40 px-3 py-2 text-sm text-ink placeholder:text-subtle focus:border-brand-500 focus:bg-card focus:outline-none';
const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 rounded-field bg-brand-500 px-3.5 py-2 text-sm font-semibold text-on-accent transition hover:bg-brand-600';
const btnSecondary =
  'inline-flex items-center justify-center gap-1.5 rounded-field border border-divider-strong bg-card px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-surface-2';

/* =========================================================================
 * SKILL 7: MARKETING DIRECTOR
 * ========================================================================= */
export function MarketingView({ project, onUpdate }: SkillViewProps) {
  const mk = project.marketing;
  const cfo = computeCfo(project);
  const panel = summarizePanel(project.panel.personas);
  const maxCac = Math.max(0, Math.round(cfo.contributionUnit * 0.4));
  const totalBudget = mk.channels.reduce((s, ch) => s + ch.budget, 0);

  const handleSave = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const splitLines = (s: FormDataEntryValue | null) =>
      String(s ?? '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    onUpdate(
      (p) => ({
        ...p,
        marketing: {
          ...p.marketing,
          positioning: String(fd.get('positioning') ?? '').trim(),
          targetAudienceSummary: String(fd.get('targetAudienceSummary') ?? '').trim(),
          adBudgetMonthly: parseNum(fd.get('adBudgetMonthly')),
          hooks: splitLines(fd.get('hooks')),
          contentIdeas: splitLines(fd.get('contentIdeas')),
          kpis: splitLines(fd.get('kpis'))
        }
      }),
      'برنامه بازاریابی ذخیره شد.'
    );
  };

  const handleAddChannel = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') ?? '').trim();
    if (!name) return;
    onUpdate(
      (p) => ({
        ...p,
        marketing: {
          ...p.marketing,
          channels: [
            ...p.marketing.channels,
            {
              id: uid('ch'),
              name,
              reason: String(fd.get('reason') ?? '').trim(),
              budget: parseNum(fd.get('budget')),
              estCac: parseNum(fd.get('estCac')),
              kpi: String(fd.get('kpi') ?? '').trim()
            }
          ]
        }
      }),
      'کانال جذب جدید اضافه شد.'
    );
    e.currentTarget.reset();
  };

  const handleAddPlanTask = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const task = String(fd.get('task') ?? '').trim();
    if (!task) return;
    onUpdate((p) => ({
      ...p,
      marketing: {
        ...p.marketing,
        plan30Days: [...p.marketing.plan30Days, { id: uid('mp'), week: String(fd.get('week') ?? 'هفته ۱'), task, done: false }]
      }
    }));
    e.currentTarget.reset();
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="glass rounded-card p-4">
          <div className="t-caption text-muted">سقف منطقی هزینه جذب (CAC)</div>
          <div className={`t-figure-md mt-1 ${maxCac > 0 ? 'text-positive' : 'text-negative'}`}>
            {formatMoney(maxCac, project.currency)}
          </div>
          <div className="t-caption text-subtle">۴۰٪ سود مشارکت هر فروش (از CFO)</div>
        </div>
        <div className="glass rounded-card p-4">
          <div className="t-caption text-muted">جمع بودجه کانال‌ها</div>
          <div className="t-figure-md mt-1">{formatMoney(totalBudget, project.currency)}</div>
          <div className="t-caption text-subtle">{formatNum(mk.channels.length)} کانال ثبت‌شده</div>
        </div>
        <div className="glass rounded-card p-4">
          <div className="t-caption text-muted">بهترین گروه مخاطب (از پنل)</div>
          <div className="mt-1 text-sm font-bold">{panel.topSegment?.segment ?? 'پنل اجرا نشده'}</div>
        </div>
      </div>

      <form onSubmit={handleSave} className="glass rounded-card grid gap-3 p-5 md:grid-cols-2">
        <h2 className="t-title md:col-span-2">جایگاه‌یابی، پیام تبلیغاتی و ایده محتوا</h2>
        <textarea name="positioning" defaultValue={mk.positioning} placeholder="بیانیه جایگاه‌یابی برند" rows={2} className={`${fieldCls} md:col-span-2`} />
        <textarea name="targetAudienceSummary" defaultValue={mk.targetAudienceSummary || project.profile.targetCustomer} placeholder="مشتری هدف" rows={2} className={fieldCls} />
        <input name="adBudgetMonthly" type="number" min={0} defaultValue={mk.adBudgetMonthly} placeholder="بودجه تبلیغات ماهانه" className={fieldCls} />
        <textarea name="hooks" defaultValue={mk.hooks.join('\n')} placeholder="پیام‌ها و قلاب‌های تبلیغاتی (هر خط یک پیام)" rows={3} className={fieldCls} />
        <textarea name="contentIdeas" defaultValue={mk.contentIdeas.join('\n')} placeholder="ایده‌های محتوا (هر خط یک ایده)" rows={3} className={fieldCls} />
        <textarea name="kpis" defaultValue={mk.kpis.join('\n')} placeholder="شاخص‌های کلیدی عملکرد (هر خط یک شاخص)" rows={2} className={`${fieldCls} md:col-span-2`} />
        <div className="flex justify-end md:col-span-2">
          <button type="submit" className={btnPrimary}>ذخیره استراتژی بازاریابی</button>
        </div>
      </form>

      <div className="glass rounded-card space-y-3 p-5">
        <h3 className="t-section">کانال‌های جذب مشتری</h3>
        <form onSubmit={handleAddChannel} className="grid gap-2.5 md:grid-cols-3">
          <input name="name" required placeholder="نام کانال *" className={fieldCls} />
          <input name="reason" placeholder="دلیل تناسب با مشتری" className={fieldCls} />
          <input name="kpi" placeholder="شاخص سنجش (KPI)" className={fieldCls} />
          <input name="budget" type="number" min={0} placeholder="بودجه ماهانه" className={fieldCls} />
          <input name="estCac" type="number" min={0} placeholder="CAC تخمینی" className={fieldCls} />
          <button type="submit" className={btnPrimary}>افزودن کانال</button>
        </form>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr><th>کانال</th><th>دلیل تناسب</th><th>بودجه</th><th>CAC تخمینی</th><th>وضعیت CAC</th><th>حذف</th></tr>
            </thead>
            <tbody>
              {mk.channels.map((ch) => {
                const over = maxCac > 0 && ch.estCac > maxCac;
                return (
                  <tr key={ch.id}>
                    <td className="font-semibold">{ch.name}</td>
                    <td className="whitespace-normal text-xs text-muted">{ch.reason || '—'}</td>
                    <td className="num-ltr">{formatMoney(ch.budget, project.currency)}</td>
                    <td className="num-ltr">{formatMoney(ch.estCac, project.currency)}</td>
                    <td>
                      <span className={`badge ${over ? 'bg-loss/15 text-negative' : 'bg-gain/15 text-positive'}`}>
                        {over ? 'بالاتر از سقف مجاز' : 'اقتصادی'}
                      </span>
                    </td>
                    <td>
                      <button type="button" className={btnSecondary} onClick={() => onUpdate((p) => ({ ...p, marketing: { ...p.marketing, channels: p.marketing.channels.filter((x) => x.id !== ch.id) } }))}>
                        حذف
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass rounded-card space-y-3 p-5">
        <h3 className="t-section">برنامه ۳۰ روزه بازاریابی</h3>
        <form onSubmit={handleAddPlanTask} className="flex flex-wrap gap-2">
          <select name="week" className="rounded-field border border-divider-strong bg-card px-3 py-1.5 text-sm">
            <option>هفته ۱</option><option>هفته ۲</option><option>هفته ۳</option><option>هفته ۴</option>
          </select>
          <input name="task" required placeholder="اقدام بازاریابی..." className={`${fieldCls} flex-1`} />
          <button type="submit" className={btnPrimary}>افزودن</button>
        </form>
        <div className="divide-y divide-divider">
          {mk.plan30Days.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={(e) =>
                    onUpdate((p) => ({
                      ...p,
                      marketing: {
                        ...p.marketing,
                        plan30Days: p.marketing.plan30Days.map((x) => (x.id === t.id ? { ...x, done: e.target.checked } : x))
                      }
                    }))
                  }
                  className="accent-brand-500"
                />
                <span className="badge bg-surface-2 text-muted">{t.week}</span>
                <span className={t.done ? 'text-subtle line-through' : ''}>{t.task}</span>
              </label>
              <button type="button" className={btnSecondary} onClick={() => onUpdate((p) => ({ ...p, marketing: { ...p.marketing, plan30Days: p.marketing.plan30Days.filter((x) => x.id !== t.id) } }))}>
                حذف
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
 * SKILL 8: BRAND DESIGNER
 * ========================================================================= */
export function BrandView({ project, onUpdate }: SkillViewProps) {
  const br = project.brand;

  const handleSave = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const splitList = (s: FormDataEntryValue | null) =>
      String(s ?? '').split(/[،,\n]+/).map((x) => x.trim()).filter(Boolean);
    onUpdate(
      (p) => ({
        ...p,
        brand: {
          ...p.brand,
          candidates: splitList(fd.get('candidates')),
          topThree: splitList(fd.get('topThree')).slice(0, 3),
          slogan: String(fd.get('slogan') ?? '').trim(),
          promise: String(fd.get('promise') ?? '').trim(),
          voice: String(fd.get('voice') ?? '').trim(),
          personality: String(fd.get('personality') ?? '').trim(),
          fonts: String(fd.get('fonts') ?? '').trim(),
          logoGuide: String(fd.get('logoGuide') ?? '').trim(),
          visualExperience: String(fd.get('visualExperience') ?? '').trim()
        }
      }),
      'هویت برند ذخیره شد.'
    );
  };

  const suggestNames = () => {
    const base = (project.profile.name || 'ایده').split(/\s+/)[0].replace(/[«»()]/g, '') || 'نو';
    const list = [`${base}‌نو`, `${base}‌یار`, `${base}‌خانه`, `راه${base}`, `${base}‌پلاس`, `تازه${base}`, `${base}‌کده`, `نیک‌${base}`, `${base}‌رس`, `بام‌${base}`];
    onUpdate((p) => ({ ...p, brand: { ...p.brand, candidates: list, topThree: list.slice(0, 3) } }), '۱۰ نام پیشنهادی اولیه تولید شد.');
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSave} className="glass rounded-card grid gap-3 p-5 md:grid-cols-2">
        <div className="flex flex-wrap items-center justify-between gap-2 md:col-span-2">
          <h2 className="t-title">طراحی برند، نام‌گذاری و هویت کلامی</h2>
          <button type="button" onClick={suggestNames} className={btnSecondary}>پیشنهاد ۱۰ نام اولیه</button>
        </div>
        <textarea name="candidates" defaultValue={br.candidates.join('، ')} placeholder="۱۰ نام پیشنهادی" rows={2} className={fieldCls} />
        <textarea name="topThree" defaultValue={br.topThree.join('، ')} placeholder="۳ نام برتر" rows={2} className={fieldCls} />
        <input name="slogan" defaultValue={br.slogan} placeholder="شعار برند" className={fieldCls} />
        <input name="promise" defaultValue={br.promise} placeholder="وعده اصلی برند" className={fieldCls} />
        <textarea name="voice" defaultValue={br.voice} placeholder="هویت کلامی" rows={2} className={fieldCls} />
        <textarea name="personality" defaultValue={br.personality} placeholder="شخصیت برند" rows={2} className={fieldCls} />
        <input name="fonts" defaultValue={br.fonts} placeholder="فونت‌های فارسی پیشنهادی" className={fieldCls} />
        <textarea name="logoGuide" defaultValue={br.logoGuide} placeholder="راهنمای طراحی لوگو" rows={2} className={fieldCls} />
        <textarea name="visualExperience" defaultValue={br.visualExperience} placeholder="تجربه بصری مشتری" rows={2} className={`${fieldCls} md:col-span-2`} />
        <div className="flex justify-end md:col-span-2">
          <button type="submit" className={btnPrimary}>ذخیره هویت برند</button>
        </div>
      </form>

      <div className="glass rounded-card p-5">
        <h3 className="t-section mb-3">پالت رنگی برند با کد HEX</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {br.colors.map((c, idx) => (
            <div key={idx} className="space-y-2 rounded-field border border-divider p-3">
              <div className="h-11 rounded-control border border-divider" style={{ background: c.hex }} />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">{c.name}</span>
                <input
                  type="color"
                  value={c.hex}
                  onChange={(e) =>
                    onUpdate((p) => {
                      const next = [...p.brand.colors];
                      next[idx] = { ...next[idx], hex: e.target.value };
                      return { ...p, brand: { ...p.brand, colors: next } };
                    })
                  }
                />
              </div>
              <code className="font-latin block text-xs text-muted">{c.hex}</code>
            </div>
          ))}
        </div>
      </div>

      <div className="glass rounded-card space-y-2.5 p-5 text-sm">
        <h3 className="t-section">چک‌لیست بررسی دستی دامنه، نام تجاری و علامت تجاری</h3>
        <p className="t-caption text-warn">آزاد بودن نام به‌صورت خودکار تأیید نمی‌شود؛ لطفاً از مراجع رسمی زیر دستی بررسی کنید:</p>
        {[
          { key: 'domainIr' as const, label: 'بررسی دامنه .ir در ایرنیک', url: 'https://whois.nic.ir/' },
          { key: 'domainCom' as const, label: 'بررسی دامنه .com در ICANN Lookup', url: 'https://lookup.icann.org/' },
          { key: 'trademark' as const, label: 'استعلام علامت تجاری در مرکز مالکیت معنوی', url: 'https://ipm.ssaa.ir/' },
          { key: 'socialHandles' as const, label: 'بررسی نام کاربری در اینستاگرام، تلگرام و لینکدین', url: '' }
        ].map((item) => (
          <label key={item.key} className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={br.checks[item.key]}
              onChange={(e) =>
                onUpdate((p) => ({ ...p, brand: { ...p.brand, checks: { ...p.brand.checks, [item.key]: e.target.checked } } }))
              }
              className="accent-brand-500"
            />
            <span>{item.label}</span>
            {item.url && (
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-brand-500 underline">
                مشاهده سامانه
              </a>
            )}
          </label>
        ))}
      </div>
    </div>
  );
}

/* =========================================================================
 * SKILL 9: OPERATIONS MANAGER (WITH 1-CLICK CFO SYNC)
 * ========================================================================= */
export function OperationsView({ project, onUpdate }: SkillViewProps) {
  const ops = project.operations;
  const costs = computeOpsCosts(project);

  const syncToCfo = () => {
    onUpdate((p) => {
      const next: FounderLabProject = {
        ...p,
        profile: { ...p.profile, initialCapital: costs.equipmentTotal || p.profile.initialCapital },
        cfo: {
          ...p.cfo,
          initialCapital: costs.equipmentTotal || p.cfo.initialCapital,
          variableCostPerUnit: costs.unitMaterialTotal || p.cfo.variableCostPerUnit,
          salaries: costs.monthlyPayrollTotal || p.cfo.salaries
        }
      };
      next.snapshots = [buildSnapshot(next, 'همگام‌سازی هزینه‌های عملیات با CFO'), ...p.snapshots].slice(0, 30);
      return next;
    }, 'هزینه‌های عملیات به مدیر مالی (CFO) منتقل شد.');
  };

  return (
    <div className="space-y-4">
      <div className="glass rounded-card space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="t-title">جمع هزینه‌های عملیاتی</h2>
            <p className="t-caption text-muted">تغییرات تجهیزات، مواد اولیه و نیروی انسانی با یک کلیک به CFO منتقل می‌شود.</p>
          </div>
          <button type="button" onClick={syncToCfo} className={btnPrimary}>همگام‌سازی با مدیر مالی (CFO)</button>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-field border border-divider bg-surface-2/40 p-3.5">
            <div className="t-caption text-muted">جمع تجهیزات (سرمایه اولیه)</div>
            <div className="t-figure-md mt-1">{formatMoney(costs.equipmentTotal, project.currency)}</div>
          </div>
          <div className="rounded-field border border-divider bg-surface-2/40 p-3.5">
            <div className="t-caption text-muted">جمع مواد اولیه هر واحد</div>
            <div className="t-figure-md mt-1">{formatMoney(costs.unitMaterialTotal, project.currency)}</div>
          </div>
          <div className="rounded-field border border-divider bg-surface-2/40 p-3.5">
            <div className="t-caption text-muted">جمع حقوق ماهانه نیروها</div>
            <div className="t-figure-md mt-1">{formatMoney(costs.monthlyPayrollTotal, project.currency)}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Equipment */}
        <div className="glass rounded-card space-y-2.5 p-4">
          <h3 className="t-section">تجهیزات موردنیاز</h3>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              onUpdate((p) => ({
                ...p,
                operations: { ...p.operations, equipment: [...p.operations.equipment, { id: uid('eq'), name: String(fd.get('name')), cost: parseNum(fd.get('cost')) }] }
              }));
              e.currentTarget.reset();
            }}
          >
            <input name="name" required placeholder="نام تجهیز" className={fieldCls} />
            <input name="cost" type="number" min={0} required placeholder="هزینه خرید" className={fieldCls} />
            <button type="submit" className={`${btnPrimary} w-full`}>افزودن</button>
          </form>
          {ops.equipment.map((x) => (
            <div key={x.id} className="flex items-center justify-between border-b border-divider py-1.5 text-xs">
              <span>{x.name} ({formatMoney(x.cost, project.currency)})</span>
              <button type="button" className="text-negative" onClick={() => onUpdate((p) => ({ ...p, operations: { ...p.operations, equipment: p.operations.equipment.filter((i) => i.id !== x.id) } }))}>×</button>
            </div>
          ))}
        </div>

        {/* Materials */}
        <div className="glass rounded-card space-y-2.5 p-4">
          <h3 className="t-section">مواد اولیه و تأمین‌کنندگان</h3>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              onUpdate((p) => ({
                ...p,
                operations: {
                  ...p.operations,
                  materials: [...p.operations.materials, { id: uid('mat'), name: String(fd.get('name')), supplier: String(fd.get('supplier') ?? ''), unitCost: parseNum(fd.get('unitCost')) }]
                }
              }));
              e.currentTarget.reset();
            }}
          >
            <input name="name" required placeholder="ماده اولیه" className={fieldCls} />
            <input name="supplier" placeholder="تأمین‌کننده" className={fieldCls} />
            <input name="unitCost" type="number" min={0} required placeholder="هزینه هر واحد" className={fieldCls} />
            <button type="submit" className={`${btnPrimary} w-full`}>افزودن</button>
          </form>
          {ops.materials.map((x) => (
            <div key={x.id} className="flex items-center justify-between border-b border-divider py-1.5 text-xs">
              <span>{x.name} ({formatMoney(x.unitCost, project.currency)})</span>
              <button type="button" className="text-negative" onClick={() => onUpdate((p) => ({ ...p, operations: { ...p.operations, materials: p.operations.materials.filter((i) => i.id !== x.id) } }))}>×</button>
            </div>
          ))}
        </div>

        {/* Staff */}
        <div className="glass rounded-card space-y-2.5 p-4">
          <h3 className="t-section">نیروی انسانی</h3>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              onUpdate((p) => ({
                ...p,
                operations: { ...p.operations, staff: [...p.operations.staff, { id: uid('st'), name: String(fd.get('name')), monthlySalary: parseNum(fd.get('monthlySalary')) }] }
              }));
              e.currentTarget.reset();
            }}
          >
            <input name="name" required placeholder="نقش / سمت" className={fieldCls} />
            <input name="monthlySalary" type="number" min={0} required placeholder="حقوق ماهانه" className={fieldCls} />
            <button type="submit" className={`${btnPrimary} w-full`}>افزودن</button>
          </form>
          {ops.staff.map((x) => (
            <div key={x.id} className="flex items-center justify-between border-b border-divider py-1.5 text-xs">
              <span>{x.name} ({formatMoney(x.monthlySalary, project.currency)})</span>
              <button type="button" className="text-negative" onClick={() => onUpdate((p) => ({ ...p, operations: { ...p.operations, staff: p.operations.staff.filter((i) => i.id !== x.id) } }))}>×</button>
            </div>
          ))}
        </div>
      </div>

      <form
        className="glass rounded-card grid gap-3 p-5 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          onUpdate(
            (p) => ({
              ...p,
              operations: {
                ...p.operations,
                dailyTasks: String(fd.get('dailyTasks') ?? ''),
                salesProcess: String(fd.get('salesProcess') ?? ''),
                supportProcess: String(fd.get('supportProcess') ?? ''),
                inventoryProcess: String(fd.get('inventoryProcess') ?? ''),
                logisticsProcess: String(fd.get('logisticsProcess') ?? ''),
                permits: String(fd.get('permits') ?? ''),
                insurance: String(fd.get('insurance') ?? '')
              }
            }),
            'فرآیندهای عملیات ذخیره شد.'
          );
        }}
      >
        <h3 className="t-section md:col-span-2">فرآیندهای اجرایی، مجوزها و بیمه</h3>
        <textarea name="dailyTasks" defaultValue={ops.dailyTasks} placeholder="وظایف روزانه" rows={2} className={fieldCls} />
        <textarea name="salesProcess" defaultValue={ops.salesProcess} placeholder="فرآیند فروش" rows={2} className={fieldCls} />
        <textarea name="supportProcess" defaultValue={ops.supportProcess} placeholder="پشتیبانی مشتری" rows={2} className={fieldCls} />
        <textarea name="inventoryProcess" defaultValue={ops.inventoryProcess} placeholder="مدیریت موجودی" rows={2} className={fieldCls} />
        <textarea name="logisticsProcess" defaultValue={ops.logisticsProcess} placeholder="لجستیک و ارسال" rows={2} className={fieldCls} />
        <textarea name="permits" defaultValue={ops.permits} placeholder="مجوزهای احتمالی" rows={2} className={fieldCls} />
        <input name="insurance" defaultValue={ops.insurance} placeholder="بیمه و پوشش ریسک" className={`${fieldCls} md:col-span-2`} />
        <div className="flex justify-end md:col-span-2"><button type="submit" className={btnPrimary}>ذخیره فرآیندها</button></div>
      </form>
    </div>
  );
}

/* =========================================================================
 * SKILL 10: LAUNCH LEAD (LOW-COST REAL MARKET EXPERIMENT)
 * ========================================================================= */
export function LaunchView({ project, onUpdate }: SkillViewProps) {
  const ln = project.launch;
  const exp = ln.experiment;

  const handleSave = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const status = (fd.get('status') as FounderLabProject['launch']['experiment']['status']) || 'not_started';
    onUpdate(
      (p) => ({
        ...p,
        launch: {
          ...p.launch,
          launchDate: String(fd.get('launchDate') ?? ''),
          first30Kpis: String(fd.get('first30Kpis') ?? '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean),
          experiment: {
            ...p.launch.experiment,
            type: String(fd.get('type') ?? 'پیش‌فروش محصول'),
            status,
            hypothesis: String(fd.get('hypothesis') ?? '').trim(),
            successCriteria: String(fd.get('successCriteria') ?? '').trim(),
            budget: parseNum(fd.get('budget')),
            targetCount: Math.max(1, parseNum(fd.get('targetCount'), 15)),
            actualCount: Math.max(0, parseNum(fd.get('actualCount'))),
            notes: String(fd.get('notes') ?? '').trim(),
            completedAt: status === 'validated' || status === 'failed' ? new Date().toISOString() : null
          }
        }
      }),
      'برنامه آزمایش واقعی بازار و راه‌اندازی ذخیره شد.'
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-field border border-info/30 bg-brand-50/60 p-3.5 text-sm">
        <strong>اولویت اول:</strong> پیش از صرف سرمایه اصلی، کم‌هزینه‌ترین آزمایش واقعی (پیش‌فروش، صفحه ثبت‌نام یا سفارش اولیه) را اجرا کنید. وضعیت «اعتبارسنجی‌شده در آزمایش» در طرح کسب‌وکار <strong>فقط</strong> پس از ثبت موفقیت این بخش فعال می‌شود.
      </div>

      <form onSubmit={handleSave} className="glass rounded-card grid gap-3 p-5 md:grid-cols-2">
        <h2 className="t-title md:col-span-2">آزمایش کم‌هزینه واقعی بازار</h2>
        <select name="type" defaultValue={exp.type} className={fieldCls}>
          <option>پیش‌فروش محصول</option>
          <option>ایجاد صفحه معرفی و ثبت‌نام</option>
          <option>دریافت سفارش اولیه</option>
          <option>اجرای آزمایشی خدمت</option>
          <option>تست با مشتریان واقعی</option>
        </select>
        <select name="status" defaultValue={exp.status} className={fieldCls}>
          <option value="not_started">هنوز اجرا نشده</option>
          <option value="running">در حال اجرا</option>
          <option value="validated">موفق — معیار موفقیت واقعی کسب شد</option>
          <option value="failed">ناموفق — نیاز به اصلاح ایده یا قیمت</option>
        </select>
        <textarea name="hypothesis" defaultValue={exp.hypothesis} placeholder="فرضیه اصلی آزمایش" rows={2} className={`${fieldCls} md:col-span-2`} />
        <textarea name="successCriteria" defaultValue={exp.successCriteria} placeholder="معیار موفقیت از پیش تعیین‌شده" rows={2} className={`${fieldCls} md:col-span-2`} />
        <input name="budget" type="number" min={0} defaultValue={exp.budget} placeholder="بودجه آزمایش" className={fieldCls} />
        <input name="launchDate" type="date" defaultValue={ln.launchDate} className={fieldCls} />
        <input name="targetCount" type="number" min={1} defaultValue={exp.targetCount} placeholder="تعداد هدف (مثلاً ۱۵ سفارش)" className={fieldCls} />
        <input name="actualCount" type="number" min={0} defaultValue={exp.actualCount} placeholder="تعداد واقعی به‌دست‌آمده" className={fieldCls} />
        <textarea name="notes" defaultValue={exp.notes} placeholder="نتایج و مشاهدات واقعی" rows={2} className={`${fieldCls} md:col-span-2`} />
        <textarea name="first30Kpis" defaultValue={ln.first30Kpis.join('\n')} placeholder="شاخص‌های عملکرد ۳۰ روز اول (هر خط یک شاخص)" rows={2} className={`${fieldCls} md:col-span-2`} />
        <div className="flex justify-end md:col-span-2">
          <button type="submit" className={btnPrimary}>ذخیره آزمایش و برنامه راه‌اندازی</button>
        </div>
      </form>
    </div>
  );
}

/* =========================================================================
 * SKILL 11: BUSINESS PLAN (COMPILED REPORT + PRINT / PDF)
 * ========================================================================= */
export function BusinessPlanView({ project }: SkillViewProps) {
  const status = computeBusinessPlanStatus(project);
  const board = computeBoard(project);
  const comp = analyzeCompetitors(project);
  const panel = summarizePanel(project.panel.personas);
  const real = summarizeRealSurvey(project.realSurvey);
  const vwData = getActiveVwData(project);
  const cfo = computeCfo(project);
  const opsCosts = computeOpsCosts(project);

  const badgeTone =
    status.tone === 'success'
      ? 'bg-gain/15 text-positive border-gain/30'
      : status.tone === 'danger'
        ? 'bg-loss/15 text-negative border-loss/30'
        : status.tone === 'warn'
          ? 'bg-warn/15 text-warn border-warn/30'
          : 'bg-surface-2 text-muted border-divider-strong';

  return (
    <div className="space-y-4">
      <div className="glass-strong rounded-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="t-headline">طرح نهایی کسب‌وکار: {project.profile.name || 'پروژه بدون نام'}</h2>
            <p className="t-caption mt-1 text-muted">گزارش جامع ۱۱ مرحله‌ای Founder Lab در دارینو</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${badgeTone}`}>وضعیت: {status.label}</span>
            <button type="button" onClick={() => window.print()} className={`${btnPrimary} print:hidden`}>
              چاپ / ذخیره PDF
            </button>
          </div>
        </div>
        <p className="mt-3 text-sm font-semibold">{status.summary}</p>
        <ul className="mt-2 list-disc space-y-1 pr-5 text-sm text-muted">
          {status.reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="glass rounded-card space-y-2 p-5 text-sm">
          <h3 className="t-section">۱. خلاصه مدیریتی و هیئت‌مدیره</h3>
          <p><strong>شرح ایده:</strong> {project.profile.description || 'ثبت نشده'}</p>
          <p><strong>مسئله:</strong> {project.profile.problem || 'ثبت نشده'}</p>
          <p><strong>محصول:</strong> {project.profile.product || 'ثبت نشده'}</p>
          <p><strong>رأی هیئت‌مدیره:</strong> {board.verdictLabel} ({formatNum(board.averageScore, 1)} / ۱۰)</p>
        </div>

        <div className="glass rounded-card space-y-2 p-5 text-sm">
          <h3 className="t-section">۲. بازار هدف، رقبا و پنل مشتریان</h3>
          <p><strong>مشتری هدف:</strong> {project.profile.targetCustomer || 'ثبت نشده'}</p>
          <p><strong>شدت رقابت:</strong> {comp.intensity} ({formatNum(comp.total)} مورد)</p>
          <p>
            <span className="badge bg-brand-50 text-brand-600">شبیه‌سازی فرضی</span> تمایل فرضی: <strong>{panel.total ? formatPct(panel.buyRate) : 'اجرا نشده'}</strong> (احتمال فروش واقعی نیست)
          </p>
          <p>
            <span className="badge bg-gain/15 text-positive">نظرسنجی واقعی</span> تعداد پاسخ واقعی: <strong>{formatNum(real.total)}</strong> · تمایل واقعی: <strong>{real.total ? formatPct(real.buyRate) : 'ثبت نشده'}</strong>
          </p>
        </div>

        <div className="glass rounded-card space-y-2 p-5 text-sm">
          <h3 className="t-section">۳. قیمت‌گذاری و پیشنهاد فروش</h3>
          <p><strong>قیمت فعلی:</strong> {formatMoney(cfo.salePrice, project.currency)}</p>
          <p>
            <strong>Van Westendorp:</strong>{' '}
            {vwData.vw.valid
              ? `بازه ${formatMoney(vwData.vw.pmc, project.currency)} تا ${formatMoney(vwData.vw.pme, project.currency)} · OPP: ${formatMoney(vwData.vw.opp, project.currency)}`
              : 'محاسبه نشده'}
          </p>
          <p><strong>ضمانت:</strong> {project.offer.guarantee || 'ثبت نشده'}</p>
          <p><strong>پیشنهاد افتتاحیه:</strong> {project.offer.launchOffer || 'ثبت نشده'}</p>
        </div>

        <div className="glass rounded-card space-y-2 p-5 text-sm">
          <h3 className="t-section">۴. تحلیل مالی و سرمایه موردنیاز (CFO)</h3>
          <p><strong>سود مشارکت واحد:</strong> {formatMoney(cfo.contributionUnit, project.currency)} ({formatPct(cfo.contributionMarginPct)})</p>
          <p><strong>نقطه سربه‌سر:</strong> {Number.isFinite(cfo.breakEvenUnitsMonthly) ? `${formatNum(cfo.breakEvenUnitsMonthly)} واحد/ماه` : 'ناممکن'}</p>
          <p><strong>سود عملیاتی سال اول:</strong> <strong className={cfo.year1OperatingProfit > 0 ? 'text-positive' : 'text-negative'}>{formatMoney(cfo.year1OperatingProfit, project.currency)}</strong></p>
          <p><strong>نقدینگی کل لازم:</strong> {formatMoney(cfo.totalCapitalNeeded, project.currency)} (بازگشت: {cfo.paybackMonth !== null ? `ماه ${formatNum(cfo.paybackMonth, 1)}` : '> ۱۲ ماه'})</p>
        </div>

        <div className="glass rounded-card space-y-2 p-5 text-sm">
          <h3 className="t-section">۵. بازاریابی و هویت برند</h3>
          <p><strong>جایگاه‌یابی:</strong> {project.marketing.positioning || 'ثبت نشده'}</p>
          <p><strong>۳ نام برتر:</strong> {project.brand.topThree.join('، ') || 'ثبت نشده'}</p>
          <p><strong>شعار:</strong> {project.brand.slogan || 'ثبت نشده'}</p>
        </div>

        <div className="glass rounded-card space-y-2 p-5 text-sm">
          <h3 className="t-section">۶. عملیات و آزمایش واقعی راه‌اندازی</h3>
          <p><strong>تجهیزات / حقوق عملیات:</strong> {formatMoney(opsCosts.equipmentTotal, project.currency)} / {formatMoney(opsCosts.monthlyPayrollTotal, project.currency)}</p>
          <p><strong>آزمایش بازار:</strong> {project.launch.experiment.type} — وضعیت: <strong>{project.launch.experiment.status}</strong> ({formatNum(project.launch.experiment.actualCount)} از {formatNum(project.launch.experiment.targetCount)})</p>
        </div>
      </div>
    </div>
  );
}
