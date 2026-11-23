import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Cloud, CloudOff, Download, FlaskConical, History, Plus, Printer, Settings, Trash2, Upload } from 'lucide-react';
import {
  buildSnapshot,
  computeBoard,
  computeBusinessPlanStatus,
  computeCfo,
  computeSkillCompletion,
  formatMoney,
  formatNum,
  formatPct,
  parseNum,
  summarizePanel,
  summarizeRealSurvey,
  todayIso
} from '../domain/engines';
import {
  CURRENCIES,
  SKILL_META,
  STAGES,
  type BusinessStage,
  type CurrencyCode,
  type FounderLabProject,
  type FounderLabTab
} from '../domain/types';
import {
  bulkImportRemoteProjects,
  createDemoProject,
  createEmptyProject,
  deleteRemoteProject,
  downloadTextFile,
  fetchRemoteProjects,
  loadLocalProjects,
  saveLocalProjects,
  upsertRemoteProject,
  wipeRemoteProjects
} from '../infrastructure/founderLabRepo';
import { BoardView, CfoView, CompetitorsView, ConsumerPanelView, OfferView, PricingView } from './SkillsViewsA';
import { BrandView, BusinessPlanView, LaunchView, MarketingView, OperationsView } from './SkillsViewsB';

const fieldCls =
  'w-full rounded-field border border-divider-strong bg-surface-2/40 px-3 py-2 text-sm text-ink placeholder:text-subtle focus:border-brand-500 focus:bg-card focus:outline-none';
const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 rounded-field bg-brand-500 px-3.5 py-2 text-sm font-semibold text-on-accent transition hover:bg-brand-600';
const btnSecondary =
  'inline-flex items-center justify-center gap-1.5 rounded-field border border-divider-strong bg-card px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-surface-2';

export function FounderLabPage() {
  const [projects, setProjects] = useState<FounderLabProject[]>(() => loadLocalProjects());
  const [activeId, setActiveId] = useState<string>(() => loadLocalProjects()[0]?.id ?? '');
  const [tab, setTab] = useState<FounderLabTab>('dashboard');
  const [dbMode, setDbMode] = useState<'checking' | 'neon' | 'local'>('checking');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2800);
  };

  // Sync with Neon PostgreSQL (/api/founderLab) on mount
  useEffect(() => {
    let active = true;
    fetchRemoteProjects().then(({ configured, projects: remote }) => {
      if (!active) return;
      if (!configured) {
        setDbMode('local');
        return;
      }
      setDbMode('neon');
      if (remote.length > 0) {
        setProjects(remote);
        setActiveId(remote[0].id);
        saveLocalProjects(remote);
      } else {
        // Push initial local/demo project to Neon so DB starts populated cleanly
        const local = loadLocalProjects();
        if (local.length > 0) {
          void bulkImportRemoteProjects(local);
        }
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const project = useMemo(
    () => projects.find((p) => p.id === activeId) ?? projects[0],
    [projects, activeId]
  );

  const updateProject = (updater: (p: FounderLabProject) => FounderLabProject, toastMsg?: string) => {
    if (!project) return;
    const updated: FounderLabProject = {
      ...updater(project),
      updatedAt: new Date().toISOString()
    };
    setProjects((prev) => {
      const next = prev.map((item) => (item.id === updated.id ? updated : item));
      saveLocalProjects(next);
      return next;
    });
    if (dbMode === 'neon') {
      void upsertRemoteProject(updated);
    }
    if (toastMsg) showToast(toastMsg);
  };

  const handleNewProject = () => {
    const name = window.prompt('نام ایده یا کسب‌وکار جدید را وارد کنید:');
    if (!name || !name.trim()) return;
    const created = createEmptyProject(name.trim());
    setProjects((prev) => {
      const next = [created, ...prev];
      saveLocalProjects(next);
      return next;
    });
    setActiveId(created.id);
    setTab('profile');
    if (dbMode === 'neon') void upsertRemoteProject(created);
    showToast('پروژه جدید ایجاد شد.');
  };

  const handleDeleteProject = () => {
    if (!project) return;
    if (projects.length <= 1) {
      showToast('حداقل یک پروژه باید باقی بماند.');
      return;
    }
    if (!window.confirm(`آیا از حذف پروژه «${project.profile.name || 'بدون نام'}» مطمئن هستید؟`)) return;
    const delId = project.id;
    setProjects((prev) => {
      const next = prev.filter((p) => p.id !== delId);
      saveLocalProjects(next);
      setActiveId(next[0]?.id ?? '');
      return next;
    });
    if (dbMode === 'neon') void deleteRemoteProject(delId);
    setTab('dashboard');
    showToast('پروژه حذف شد.');
  };

  const handleExportJson = () => {
    downloadTextFile(
      `darino-founder-lab-${todayIso()}.json`,
      JSON.stringify({ app: 'Darino Founder Lab', exportedAt: new Date().toISOString(), projects }, null, 2),
      'application/json;charset=utf-8'
    );
    showToast('فایل پشتیبان JSON دانلود شد.');
  };

  const handleImportJson = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? '')) as { projects?: FounderLabProject[] };
        if (!Array.isArray(parsed.projects) || parsed.projects.length === 0) {
          showToast('فایل پشتیبان معتبر نیست.');
          return;
        }
        setProjects(parsed.projects);
        setActiveId(parsed.projects[0].id);
        saveLocalProjects(parsed.projects);
        if (dbMode === 'neon') void bulkImportRemoteProjects(parsed.projects);
        showToast('فایل پشتیبان با موفقیت بازیابی شد.');
        setTab('dashboard');
      } catch {
        showToast('خطا در خواندن فایل JSON.');
      }
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  if (!project) return null;

  const comp = computeSkillCompletion(project);
  const doneCount = Object.entries(comp).filter(([k, v]) => k !== 'plan' && v).length;
  const pct = Math.round((doneCount / 10) * 100);
  const board = computeBoard(project);
  const panel = summarizePanel(project.panel.personas);
  const real = summarizeRealSurvey(project.realSurvey);
  const cfo = computeCfo(project);
  const plan = computeBusinessPlanStatus(project);
  const stageLabel = STAGES.find((s) => s.id === project.profile.stage)?.label ?? 'ایده اولیه';

  const handleSaveProfile = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const proposedPrice = parseNum(fd.get('proposedPrice'));
    const initialCapital = parseNum(fd.get('initialCapital'));
    updateProject(
      (p) => ({
        ...p,
        currency: (fd.get('currency') as CurrencyCode) || 'IRT',
        profile: {
          ...p.profile,
          name: String(fd.get('name') ?? '').trim(),
          stage: (fd.get('stage') as BusinessStage) || 'idea',
          revenueModel: String(fd.get('revenueModel') ?? '').trim(),
          description: String(fd.get('description') ?? '').trim(),
          problem: String(fd.get('problem') ?? '').trim(),
          product: String(fd.get('product') ?? '').trim(),
          targetCustomer: String(fd.get('targetCustomer') ?? '').trim(),
          targetMarket: String(fd.get('targetMarket') ?? '').trim(),
          proposedPrice,
          initialCapital,
          operatingCosts: parseNum(fd.get('operatingCosts')),
          constraints: String(fd.get('constraints') ?? '').trim()
        },
        cfo: { ...p.cfo, salePrice: proposedPrice, initialCapital }
      }),
      'پروفایل پروژه ذخیره و با CFO همگام شد.'
    );
  };

  return (
    <div className="mx-auto max-w-content space-y-5 pb-12">
      {/* Top Bar — Project Switcher, Sync Status & Quick Actions */}
      <div className="glass-strong rounded-card p-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-field bg-brand-500/12 text-brand-500">
              <FlaskConical className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="t-title">Founder Lab | آزمایشگاه ایده کسب‌وکار</h1>
                <span
                  className={`badge ${
                    dbMode === 'neon'
                      ? 'bg-gain/15 text-positive'
                      : 'bg-surface-2 text-muted'
                  }`}
                >
                  {dbMode === 'neon' ? (
                    <>
                      <Cloud className="h-3 w-3" /> متصل به دیتابیس دارینو (Neon)
                    </>
                  ) : (
                    <>
                      <CloudOff className="h-3 w-3" /> ذخیره محلی مرورگر
                    </>
                  )}
                </span>
              </div>
              <p className="t-caption text-muted">
                اعتبارسنجی ۱۱ مرحله‌ای ایده — همگام با دیتابیس و سیستم دیزاین دارینو
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={project.id}
              onChange={(e) => setActiveId(e.target.value)}
              aria-label="انتخاب پروژه فعال"
              className="rounded-field border border-divider-strong bg-card px-3 py-1.5 text-sm font-semibold text-ink"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.profile.name || 'پروژه بدون نام'}
                </option>
              ))}
            </select>
            <button type="button" onClick={handleNewProject} className={btnPrimary}>
              <Plus className="h-4 w-4" /> پروژه جدید
            </button>
            <button
              type="button"
              className={btnSecondary}
              onClick={() => {
                const note = window.prompt('توضیح کوتاه برای این نسخه تحلیل:', 'ثبت دستی نسخه تحلیل');
                if (note !== null) {
                  updateProject(
                    (p) => ({ ...p, snapshots: [buildSnapshot(p, note.trim() || 'ثبت نسخه تحلیل'), ...p.snapshots].slice(0, 30) }),
                    'نسخه تحلیل در سوابق ثبت شد.'
                  );
                }
              }}
            >
              <History className="h-3.5 w-3.5" /> ثبت نسخه
            </button>
            <button type="button" onClick={handleExportJson} className={btnSecondary}>
              <Download className="h-3.5 w-3.5" /> پشتیبان JSON
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('plan');
                window.setTimeout(() => window.print(), 150);
              }}
              className={btnSecondary}
            >
              <Printer className="h-3.5 w-3.5" /> چاپ / PDF
            </button>
            <button type="button" onClick={handleDeleteProject} className={btnSecondary} title="حذف پروژه فعال">
              <Trash2 className="h-3.5 w-3.5 text-negative" />
            </button>
          </div>
        </div>

        {/* Navigation Strip */}
        <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {[
            { id: 'dashboard' as const, label: 'داشبورد' },
            { id: 'profile' as const, label: 'پروفایل ایده' },
            ...SKILL_META.map((s) => ({ id: s.id as FounderLabTab, label: `${s.num}. ${s.title}`, done: comp[s.id] })),
            { id: 'history' as const, label: 'سوابق مقایسه' },
            { id: 'settings' as const, label: 'پشتیبان و حریم خصوصی' }
          ].map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-field px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? 'bg-brand-500 text-on-accent'
                    : 'border border-divider bg-surface-2/60 text-muted hover:text-ink'
                }`}
              >
                <span>{item.label}</span>
                {'done' in item && item.done && (
                  <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-on-accent' : 'bg-gain'}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      {tab === 'dashboard' && (
        <div className="space-y-4">
          <div className="glass rounded-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="t-title">{project.profile.name || 'پروژه بدون نام'}</h2>
                <p className="t-caption mt-1 text-muted">
                  مرحله: <strong>{stageLabel}</strong> · واحد پول: <strong>{CURRENCIES[project.currency].label}</strong>
                </p>
              </div>
              <span
                className={`badge px-3 py-1 text-xs ${
                  plan.tone === 'success'
                    ? 'bg-gain/15 text-positive'
                    : plan.tone === 'danger'
                      ? 'bg-loss/15 text-negative'
                      : plan.tone === 'warn'
                        ? 'bg-warn/15 text-warn'
                        : 'bg-surface-2 text-muted'
                }`}
              >
                وضعیت کل: {plan.label}
              </span>
            </div>
            <div className="mt-4 flex justify-between text-xs text-muted">
              <span>پیشرفت تکمیل ۱۰ مهارت تحلیلی</span>
              <strong className="text-ink">{formatNum(doneCount)} از ۱۰ ({formatPct(pct, 0)})</strong>
            </div>
            <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="glass rounded-card p-4">
              <div className="t-caption text-muted">امتیاز هیئت‌مدیره</div>
              <div className="t-figure mt-1">{formatNum(board.averageScore, 1)} / ۱۰</div>
              <div className="t-caption text-subtle">{board.verdictLabel}</div>
            </div>
            <div className="glass rounded-card p-4">
              <div className="t-caption text-muted">پنل مشتریان فرضی</div>
              <div className="t-figure mt-1">{panel.total ? formatPct(panel.buyRate) : 'اجرا نشده'}</div>
              <div className="t-caption text-subtle">شبیه‌سازی الگوریتمی · واقعی: {formatNum(real.total)} پاسخ</div>
            </div>
            <div className="glass rounded-card p-4">
              <div className="t-caption text-muted">سود مشارکت هر واحد</div>
              <div className={`t-figure-md mt-1 ${cfo.contributionUnit > 0 ? 'text-positive' : 'text-negative'}`}>
                {cfo.salePrice > 0 ? formatMoney(cfo.contributionUnit, project.currency) : '—'}
              </div>
              <div className="t-caption text-subtle">حاشیه: {cfo.salePrice > 0 ? formatPct(cfo.contributionMarginPct) : '—'}</div>
            </div>
            <div className="glass rounded-card p-4">
              <div className="t-caption text-muted">نقطه سربه‌سر روزانه</div>
              <div className="t-figure-md mt-1">
                {Number.isFinite(cfo.breakEvenUnitsDaily) ? `${formatNum(cfo.breakEvenUnitsDaily, 1)} واحد` : '—'}
              </div>
              <div className="t-caption text-subtle">ظرفیت روزانه: {cfo.dailyCapacity > 0 ? `${formatNum(cfo.dailyCapacity)} واحد` : 'ثبت نشده'}</div>
            </div>
          </div>

          <div className="glass rounded-card p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="t-section">جریان ۱۱ مهارت اعتبارسنجی کسب‌وکار</h3>
              <button type="button" onClick={() => setTab('profile')} className={btnSecondary}>ویرایش پروفایل ایده</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SKILL_META.map((sk) => (
                <button
                  key={sk.id}
                  type="button"
                  onClick={() => setTab(sk.id)}
                  className="rounded-card border border-divider bg-card p-4 text-right transition hover:border-brand-500/50 hover:shadow-card-hover"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="badge bg-surface-2 text-muted">مهارت {sk.num}</span>
                    <span className={`badge ${comp[sk.id] ? 'bg-gain/15 text-positive' : 'bg-warn/15 text-warn'}`}>
                      {comp[sk.id] ? 'تکمیل‌شده' : 'نیازمند تکمیل'}
                    </span>
                  </div>
                  <div className="font-bold text-ink">{sk.title}</div>
                  <div className="mt-1 text-xs text-muted">{sk.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'profile' && (
        <form onSubmit={handleSaveProfile} className="glass rounded-card grid gap-3.5 p-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <h2 className="t-title">پروفایل ایده و مشخصات پایه کسب‌وکار</h2>
            <p className="t-caption text-muted">نیاز نیست همه فیلدها را یک‌جا پر کنید؛ به تدریج تکمیل کنید.</p>
          </div>
          <label className="space-y-1 text-xs text-muted">
            <span>نام کسب‌وکار</span>
            <input name="name" defaultValue={project.profile.name} className={fieldCls} />
          </label>
          <label className="space-y-1 text-xs text-muted">
            <span>مرحله فعلی</span>
            <select name="stage" defaultValue={project.profile.stage} className={fieldCls}>
              {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted">
            <span>واحد پول (دلار پیش‌فرض نیست)</span>
            <select name="currency" defaultValue={project.currency} className={fieldCls}>
              {Object.values(CURRENCIES).map((c) => <option key={c.code} value={c.code}>{c.label} ({c.code})</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted">
            <span>مدل درآمدی</span>
            <input name="revenueModel" defaultValue={project.profile.revenueModel} className={fieldCls} />
          </label>
          <label className="space-y-1 text-xs text-muted md:col-span-2">
            <span>شرح ایده</span>
            <textarea name="description" defaultValue={project.profile.description} rows={2} className={fieldCls} />
          </label>
          <label className="space-y-1 text-xs text-muted md:col-span-2">
            <span>مسئله‌ای که حل می‌کند</span>
            <textarea name="problem" defaultValue={project.profile.problem} rows={2} className={fieldCls} />
          </label>
          <label className="space-y-1 text-xs text-muted md:col-span-2">
            <span>محصول یا خدمت</span>
            <textarea name="product" defaultValue={project.profile.product} rows={2} className={fieldCls} />
          </label>
          <label className="space-y-1 text-xs text-muted">
            <span>مشتری هدف</span>
            <textarea name="targetCustomer" defaultValue={project.profile.targetCustomer} rows={2} className={fieldCls} />
          </label>
          <label className="space-y-1 text-xs text-muted">
            <span>بازار هدف و موقعیت جغرافیایی</span>
            <textarea name="targetMarket" defaultValue={project.profile.targetMarket} rows={2} className={fieldCls} />
          </label>
          <label className="space-y-1 text-xs text-muted">
            <span>قیمت پیشنهادی ({CURRENCIES[project.currency].label})</span>
            <input name="proposedPrice" type="number" min={0} step="any" defaultValue={project.cfo.salePrice || project.profile.proposedPrice} className={fieldCls} />
          </label>
          <label className="space-y-1 text-xs text-muted">
            <span>سرمایه اولیه</span>
            <input name="initialCapital" type="number" min={0} step="any" defaultValue={project.cfo.initialCapital || project.profile.initialCapital} className={fieldCls} />
          </label>
          <label className="space-y-1 text-xs text-muted">
            <span>برآورد هزینه‌های جاری ماهانه</span>
            <input name="operatingCosts" type="number" min={0} step="any" defaultValue={project.profile.operatingCosts} className={fieldCls} />
          </label>
          <label className="space-y-1 text-xs text-muted">
            <span>محدودیت‌ها و منابع موجود</span>
            <input name="constraints" defaultValue={project.profile.constraints} className={fieldCls} />
          </label>
          <div className="flex justify-end gap-2 md:col-span-2">
            <button type="submit" className={btnPrimary}>ذخیره پروفایل</button>
          </div>
        </form>
      )}

      {tab === 'board' && <BoardView project={project} onUpdate={updateProject} onNavigate={setTab} />}
      {tab === 'competitors' && <CompetitorsView project={project} onUpdate={updateProject} onNavigate={setTab} />}
      {tab === 'panel' && <ConsumerPanelView project={project} onUpdate={updateProject} onNavigate={setTab} />}
      {tab === 'pricing' && <PricingView project={project} onUpdate={updateProject} onNavigate={setTab} />}
      {tab === 'offer' && <OfferView project={project} onUpdate={updateProject} onNavigate={setTab} />}
      {tab === 'cfo' && <CfoView project={project} onUpdate={updateProject} onNavigate={setTab} />}
      {tab === 'marketing' && <MarketingView project={project} onUpdate={updateProject} onNavigate={setTab} />}
      {tab === 'brand' && <BrandView project={project} onUpdate={updateProject} onNavigate={setTab} />}
      {tab === 'operations' && <OperationsView project={project} onUpdate={updateProject} onNavigate={setTab} />}
      {tab === 'launch' && <LaunchView project={project} onUpdate={updateProject} onNavigate={setTab} />}
      {tab === 'plan' && <BusinessPlanView project={project} onUpdate={updateProject} onNavigate={setTab} />}

      {tab === 'history' && (
        <div className="glass rounded-card space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="t-title">سوابق تحلیل و مقایسه قبل و بعد</h2>
              <p className="t-caption text-muted">اثر تغییر قیمت، پیشنهاد فروش یا عملیات را در گذر زمان مقایسه کنید.</p>
            </div>
            <button
              type="button"
              className={btnPrimary}
              onClick={() =>
                updateProject(
                  (p) => ({ ...p, snapshots: [buildSnapshot(p, 'ثبت دستی نسخه تحلیل'), ...p.snapshots].slice(0, 30) }),
                  'نسخه تحلیل ثبت شد.'
                )
              }
            >
              ثبت نسخه فعلی
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr><th>توضیح</th><th>قیمت</th><th>امتیاز هیئت‌مدیره</th><th>تمایل فرضی</th><th>سود واحد</th><th>سربه‌سر روزانه</th><th>سود سال اول</th><th>وضعیت</th></tr>
              </thead>
              <tbody>
                {project.snapshots.length === 0 ? (
                  <tr><td colSpan={8} className="text-center text-muted">هنوز نسخه‌ای ثبت نشده است.</td></tr>
                ) : (
                  project.snapshots.map((s) => (
                    <tr key={s.id}>
                      <td>{s.reason}</td>
                      <td className="num-ltr">{formatMoney(s.price, project.currency)}</td>
                      <td className="num-ltr">{formatNum(s.boardAvg, 1)}</td>
                      <td className="num-ltr">{s.simBuyRate !== null ? formatPct(s.simBuyRate) : '—'}</td>
                      <td className={`num-ltr ${s.unitMargin > 0 ? 'text-positive' : 'text-negative'}`}>{formatMoney(s.unitMargin, project.currency)}</td>
                      <td className="num-ltr">{s.breakEvenDaily !== null ? formatNum(s.breakEvenDaily, 1) : '—'}</td>
                      <td className={`num-ltr ${s.year1Profit > 0 ? 'text-positive' : 'text-negative'}`}>{formatMoney(s.year1Profit, project.currency)}</td>
                      <td><span className="badge bg-surface-2 text-muted">{s.planStatus}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div className="space-y-4">
          <div className="glass rounded-card space-y-2 p-5 text-sm">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-brand-500" />
              <h2 className="t-title">ذخیره‌سازی، پشتیبان‌گیری و شفافیت مدل</h2>
            </div>
            <p className="text-muted">
              پروژه‌های Founder Lab در جدول <code>&quot;founderLabProjects&quot;</code> روی دیتابیس Neon دارینو (با ایزوله‌سازی <code>userId</code>) و همچنین در <code>localStorage</code> مرورگر برای دسترسی سریع آفلاین ذخیره می‌شوند.
            </p>
            <p className="text-muted">
              <strong>تفاوت شبیه‌سازی فرضی با اعتبارسنجی واقعی:</strong> پنل ۱۰۰ مشتری فرضی یک شبیه‌سازی الگوریتمی شفاف است (نه هوش مصنوعی و نه مشتری واقعی). عدد ۷۰ از ۱۰۰ به معنای ۷۰٪ احتمال فروش واقعی نیست؛ برای اعتبارسنجی واقعی باید نتایج نظرسنجی واقعی و پیش‌فروش را ثبت کنید.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="glass rounded-card space-y-3 p-5">
              <h3 className="t-section">پشتیبان‌گیری و بازیابی JSON</h3>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={handleExportJson} className={btnPrimary}>
                  <Download className="h-4 w-4" /> دانلود فایل JSON
                </button>
                <label className={`${btnSecondary} cursor-pointer`}>
                  <Upload className="h-3.5 w-3.5" /> بازیابی از JSON
                  <input type="file" accept="application/json,.json" onChange={handleImportJson} className="hidden" />
                </label>
              </div>
            </div>

            <div className="glass rounded-card space-y-3 border-loss/30 p-5">
              <h3 className="t-section text-negative">مدیریت و حذف کامل اطلاعات Founder Lab</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() => {
                    const demo = createDemoProject();
                    setProjects((prev) => {
                      const next = [demo, ...prev.filter((x) => x.id !== demo.id)];
                      saveLocalProjects(next);
                      return next;
                    });
                    setActiveId(demo.id);
                    if (dbMode === 'neon') void upsertRemoteProject(demo);
                    showToast('پروژه نمونه بازگردانی شد.');
                  }}
                >
                  بازگردانی پروژه نمونه
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-field bg-loss px-3.5 py-2 text-xs font-semibold text-white"
                  onClick={() => {
                    if (!window.confirm('تمام پروژه‌های Founder Lab حذف شوند؟')) return;
                    const fresh = [createEmptyProject('پروژه جدید من')];
                    setProjects(fresh);
                    setActiveId(fresh[0].id);
                    saveLocalProjects(fresh);
                    if (dbMode === 'neon') {
                      void wipeRemoteProjects().then(() => upsertRemoteProject(fresh[0]));
                    }
                    showToast('تمام اطلاعات Founder Lab پاک شد.');
                  }}
                >
                  حذف کامل اطلاعات Founder Lab
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="anim-toast-in fixed bottom-20 left-5 z-toast rounded-field bg-ink px-4 py-2.5 text-xs font-semibold text-canvas shadow-pop md:bottom-6">
          {toast}
        </div>
      )}
    </div>
  );
}
