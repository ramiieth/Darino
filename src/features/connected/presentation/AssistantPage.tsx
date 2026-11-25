/**
 * دستیار پرتفولیو (AI Wealth Copilot — متصل به Google Gemini و داده‌های واقعی دارینو)
 *
 * بازطراحی کامل پس از لوپ نقد:
 *  ۱) هدر شیشه‌ای خلاصه پرتفولیو: ارزش کل، نقدینگی آزاد استیبل‌کوین، ترکیب دارایی‌های اصلی با لوگو و تازه‌سازی زنده
 *  ۲) کارت‌های شروع سریع (Prompt Cards) متناسب با تصمیم‌گیری واقعی (تخصیص نقد آزاد به BTC/SOL/HYPE و سهام، بررسی ریسک، بوروس و اهرم)
 *  ۳) تجربه گفت‌وگوی مدرن با حباب‌های مجزا، دکمه کپی پاسخ، اسکرول خودکار، میانبر Ctrl/Cmd+Enter و انیمیشن تحلیل
 *  ۴) پروفایل ریسک و افق سرمایه‌گذاری با چیپ‌های انتخاب سریع (بدون فرم‌های سنگین) + شفافیت کامل داده‌های مبنا و حریم خصوصی
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Check,
  Coins,
  Copy,
  Database,
  Lock,
  PieChart,
  RefreshCw,
  Send,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TrendingUp,
  Wallet
} from 'lucide-react';
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { LogoImage } from '@/shared/components/ui/EntityLogo';
import { Field, Input } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { Notice } from '@/shared/components/ui/StateViews';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { MarketAssetLogo } from '@/features/perps/presentation/MarketAssetIdentity';
import { isStableSymbol } from '@/features/intel/presentation/EomSetupTab';
import { fetchJson } from '@/repositories/remoteClient';
import { useCustodySync } from '@/features/custody/data/sync';
import { getPref, savePref } from '@/features/custody/data/repository';
import { cn } from '@/shared/lib/cn';
import { toFaDigits } from '@/shared/utils/formatters';
import { appContextSchema, type AppContext } from '@/shared/assistant/schema';
import { useActivity } from '../data/useActivity';
import { buildAppContext } from '../assistant/context';
import { prepareAssistantData, waitForAssistantData } from '../assistant/load';
import { isBitcoinAddress } from '../domain/bitcoinAddress';
import { visiblePositions } from '../domain/visibility';
import { useConnectedPortfolio } from '../data/useConnectedPortfolio';
import { AssistantResponse } from './AssistantResponse';
import { chainIdentity, tokenName } from './identity';
import { providerError } from './ConnectedPage';

interface StarterPrompt {
  id: string;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  text: string;
}

const STARTER_PROMPTS: readonly StarterPrompt[] = [
  {
    id: 'deploy-cash',
    label: 'برنامه تخصیص نقدینگی آزاد',
    subtitle: 'پیشنهاد پله‌ای برای BTC، SOL، HYPE و سهام (مثل NVDA) بدون خرید مجدد استیبل‌کوین',
    icon: Coins,
    accent: 'from-emerald-500/15 to-teal-500/5 border-emerald-500/30 text-emerald-700 dark:text-emerald-300',
    text: 'نقدینگی آزاد استیبل‌کوین پرتفولیوی من را بررسی کن و با توجه به شرایط بازار، یک برنامه تخصیص پله‌ای و محتاطانه فقط برای رمزارزهای منتخب (BTC، SOL، HYPE) و سهام جهانی (مثل NVDA) پیشنهاد بده. استیبل‌کوین‌ها نقد آزاد هستند و پیشنهاد خرید استیبل‌کوین نده.'
  },
  {
    id: 'portfolio-audit',
    label: 'عینک ریسک و ترکیب دارایی‌ها',
    subtitle: 'بررسی تمرکز، همبستگی دارایی‌ها، اهرم آرکوس و نقاط آسیب‌پذیر پرتفولیو',
    icon: PieChart,
    accent: 'from-indigo-500/15 to-blue-500/5 border-indigo-500/30 text-indigo-700 dark:text-indigo-300',
    text: 'ترکیب واقعی دارایی‌ها، میزان تمرکز، اهرم آرکوس و ریسک‌های اصلی پرتفولیوی من را شفاف تحلیل کن و در پایان ۳ اقدام عملی برای کاهش ریسک با مزایا و معایب هرکدام پیشنهاد بده.'
  },
  {
    id: 'boros',
    label: 'فرصت‌های واقعی بوروس',
    subtitle: 'ارزیابی مارجین آزاد، سود دلاری برآوردی و ریسک لیکوییدشدن',
    icon: TrendingUp,
    accent: 'from-violet-500/15 to-purple-500/5 border-violet-500/30 text-violet-700 dark:text-violet-300',
    text: 'حساب واقعی بوروس و مارجین آزاد هر وثیقه را بررسی کن؛ اگر پیشنهاد با پیش‌نمایش رسمی موجود است سود دلاری برآوردی و ریسک آن را توضیح بده. سناریوی فرضی را جدا نشان بده و با داده ناقص ورود قطعی پیشنهاد نده.'
  },
  {
    id: 'markets-perf',
    label: 'مقایسه عملکرد بازارها (۱ تا ۹۰ روز)',
    subtitle: 'برندگان و بازندگان اخیر بازارها + گزینه‌های خرید مشروط',
    icon: ShieldAlert,
    accent: 'from-amber-500/15 to-orange-500/5 border-amber-500/30 text-amber-700 dark:text-amber-300',
    text: 'بیشترین و کمترین سود و زیان بازارها در ۱، ۷، ۳۰، ۶۰ و ۹۰ روز گذشته را با پوشش داده مقایسه کن؛ بر اساس نقد واقعی و شرایط من گزینه‌های خرید مشروط پیشنهاد بده.'
  }
];

const HORIZON_PRESETS = ['کوتاه‌مدت (۱ تا ۳ ماه)', 'میان‌مدت (۶ تا ۱۲ ماه)', 'بلندمدت (+۲ سال)'] as const;
const RISK_PRESETS = ['محافظه‌کار', 'متعادل', 'تهاجمی'] as const;

const DATA_STATUS_FA: Record<string, string> = {
  ready: 'آماده',
  partial: 'ناقص',
  stale: 'قدیمی',
  loading: 'در حال دریافت',
  unavailable: 'ناموجود',
  reference: 'مرجع',
  empty: 'خالی',
  interface: 'رابط'
};

interface Message {
  role: 'user' | 'assistant';
  text: string;
  at: number;
}

export default function AssistantPage() {
  const [search] = useSearchParams();
  const marketQuery = search.get('borosMarket');
  const selectedMarket = marketQuery && /^\d+$/.test(marketQuery) ? Number(marketQuery) : null;

  useCustodySync();
  const p = useConnectedPortfolio();
  const activity = useActivity(p);
  const portfolioRef = useRef(p);
  portfolioRef.current = p;
  const activityRef = useRef(activity.links);
  activityRef.current = activity.links;
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const [status, setStatus] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const [question, setQuestion] = useState(
    selectedMarket !== null
      ? `پیشنهاد ورود بوروس برای بازار شمارهٔ ${new Intl.NumberFormat('fa-IR').format(selectedMarket)} را با داده‌های پیش‌نمایش موجود توضیح بده: سود خالص تخمینی، سررسید، هزینه‌ها، سناریوی نامساعد و نرخ لیکوییدشدن. اگر پیش‌نمایش منقضی یا داده ناقص است، صریح بگو و ورود قطعی پیشنهاد نده. گزینه‌ها مستقل‌اند و قرار نیست هم‌زمان باز شوند.`
      : ''
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const saved = getPref<{ horizon: string; risk: string; liquidity: string }>('ai-profile')?.value;
  const [lastContext, setLastContext] = useState<AppContext | null>(null);
  const [profile, setProfile] = useState(saved ?? { horizon: '', risk: '', liquidity: '' });

  useEffect(() => {
    void prepareAssistantData();
  }, []);

  useEffect(() => {
    if (saved) setProfile(saved);
  }, [saved]);

  useEffect(() => {
    void fetchJson<{ gemini: boolean }>('/api/integrations')
      .then((s) => setStatus(s.gemini))
      .catch((e) => setError(providerError(e)));
  }, []);

  useEffect(() => {
    if (messages.length > 0 || busy) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages.length, busy]);

  // خلاصه زنده پرتفولیو برای نمایش در نوار بالا (نقدینگی آزاد استیبل + دارایی‌های اصلی)
  const portfolioSummary = useMemo(() => {
    const bySymbol = new Map<string, number>();
    let stableCash = 0;
    for (const w of p.wallets) {
      for (const pos of visiblePositions(w.state?.data?.positions ?? [])) {
        const val = pos.value ?? 0;
        if (!(val > 0)) continue;
        const sym = pos.symbol.trim().toUpperCase();
        if (isStableSymbol(sym)) {
          stableCash += val;
        } else {
          bySymbol.set(sym, (bySymbol.get(sym) ?? 0) + val);
        }
      }
    }
    const topHoldings = [...bySymbol.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([symbol, valueUsd]) => ({ symbol, valueUsd }));

    return {
      stableCash,
      topHoldings,
      walletCount: p.wallets.length,
      arcusCount: p.arcus.filter((a) => a.holding.arcus?.env === 'mainnet').length
    };
  }, [p.wallets, p.arcus]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await Promise.allSettled([Promise.resolve(p.refresh()), prepareAssistantData(true)]);
    } finally {
      setRefreshing(false);
    }
  }

  async function copyAnswer(text: string, idx: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 1800);
    } catch {
      // ignore clipboard errors
    }
  }

  async function ask(text = question) {
    const trimmed = text.trim();
    if (!trimmed || busy || !status) return;
    setBusy(true);
    setError(null);
    setQuestion('');
    setMessages((m) => [...m, { role: 'user', text: trimmed, at: Date.now() }]);
    try {
      await savePref('ai-profile', profile);
      await waitForAssistantData();
      const portfolio = portfolioRef.current;
      const sources = [
        ...portfolio.wallets.map((s) => ({
          provider: isBitcoinAddress(s.holding.address!) ? ('bitcoin' as const) : ('zerion' as const),
          fetchedAt: s.state?.data?.fetchedAt ?? 0,
          stale: s.stale,
          value: s.value
        })),
        ...portfolio.arcus
          .filter((s) => s.holding.arcus!.env === 'mainnet')
          .map((s) => ({
            provider: 'arcus' as const,
            fetchedAt: s.state?.account.fetchedAt ?? 0,
            stale: s.stale,
            value: s.value
          }))
      ];

      // Financial summaries only: exclude addresses, account labels, transaction hashes and credentials.
      const positions = portfolio.wallets.flatMap((s) =>
        visiblePositions(s.state?.data?.positions ?? []).map((x) => ({
          symbol: x.symbol.slice(0, 40),
          name: tokenName(x.symbol, x.name).slice(0, 120),
          chain: chainIdentity(x.chain, s.state?.data?.chains).name.slice(0, 80),
          protocol: x.protocol?.slice(0, 120) ?? null,
          value: x.value,
          type: x.type.slice(0, 40),
          quantity: x.quantity?.slice(0, 120) ?? null,
          price: x.price
        }))
      );

      const arcus = portfolio.arcus
        .filter((s) => s.holding.arcus!.env === 'mainnet')
        .map((s) => ({
          equity: s.value,
          freeCollateral: s.state?.account.data?.freeCollateral ?? null,
          positions: (s.state?.positions.data ?? []).map((x) => ({
            symbol: x.marketDisplayName,
            side: x.side,
            leverage: x.leverage,
            unrealizedPnl: x.unrealizedPnl,
            marginUsed: x.marginUsed,
            borrowedCapital: x.borrowedCapital,
            notional: x.positionValueNotional,
            size: x.size,
            entryPrice: x.averageEntryPrice,
            markPrice: x.markPx,
            marginMode: x.marginMode
          }))
        }));

      if (
        positions.length > 300 ||
        sources.length > 50 ||
        arcus.length > 20 ||
        arcus.some((a) => a.positions.length > 100)
      ) {
        setError('پرتفولیو برای یک درخواست تحلیل بزرگ است؛ تعداد منابع را کاهش دهید. هیچ داده‌ای ارسال نشد.');
        setBusy(false);
        return;
      }

      const app = appContextSchema.parse(buildAppContext(portfolio, Date.now(), activityRef.current));
      setLastContext(app);

      const answer = await fetchJson<{ answer: string; generatedAt: number }>(
        '/api/integrations?op=analyze',
        {
          method: 'POST',
          body: {
            question: trimmed,
            history: messages.slice(-8).map((m) => ({ role: m.role, text: m.text.slice(0, 14000) })),
            context: {
              total: portfolio.total,
              partial:
                portfolio.partial ||
                portfolio.arcus.some(
                  (s) =>
                    s.holding.arcus!.env === 'mainnet' &&
                    (!s.state?.positions.fetchedAt || !!s.state.positions.error)
                ),
              sources,
              positions,
              arcus,
              profile,
              app
            }
          },
          timeoutMs: 120_000
        }
      );

      setMessages((m) => [...m, { role: 'assistant', text: answer.answer, at: answer.generatedAt }]);
    } catch (e) {
      setError(providerError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <PageHeader
        title="دستیار پرتفولیو"
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <LogoImage src="/logos/platform-gemini.png" label="جمینای" size={20} />
            مشاور هوشمند دارینو · Google Gemini
          </span>
        }
        subtitle="تحلیل شخصی‌سازی‌شده روی موجودی واقعی، نقدینگی آزاد، بوروس و بازارها"
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
              onClick={() => setProfileOpen((v) => !v)}
            >
              هدف و ریسک
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={<RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />}
              loading={refreshing}
              onClick={() => void handleRefresh()}
            >
              به‌روزرسانی
            </Button>
          </div>
        }
      />

      {status === false && (
        <Notice tone="warn">اتصال دستیار هوشمند (Gemini) روی سرور تنظیم نشده است.</Notice>
      )}

      {/* ۱) کارت هدر شیشه‌ای پرتفولیوی مبنای تحلیل */}
      <Surface variant="focal" className="relative overflow-hidden border border-divider/85 p-4 sm:p-5">
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-l from-indigo-500/[0.08] via-sky-500/[0.03] to-emerald-500/[0.07]"
          aria-hidden
        />
        <div className="relative space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-5">
              <div>
                <p className="text-[11px] font-semibold text-muted">ارزش کل پرتفولیو</p>
                <MoneyValue
                  value={p.total}
                  state={p.stale ? 'stale' : 'ready'}
                  className="mt-0.5 text-2xl font-black tracking-tight"
                />
              </div>

              {portfolioSummary.stableCash >= 1 && (
                <div className="border-s border-divider/70 ps-5">
                  <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    نقدینگی آزاد (استیبل‌کوین)
                  </p>
                  <MoneyValue
                    value={portfolioSummary.stableCash}
                    className="mt-0.5 text-xl font-black text-emerald-700 dark:text-emerald-300"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <Badge tone={p.stale || p.partial ? 'warn' : 'gain'}>
                {p.stale || p.partial ? 'داده ناقص / در حال همگام‌سازی' : 'متصل و به‌روز'}
              </Badge>
              {portfolioSummary.walletCount > 0 && (
                <span className="rounded-full bg-card/85 px-2.5 py-1 font-bold text-muted ring-1 ring-divider/70">
                  {toFaDigits(portfolioSummary.walletCount)} کیف پول
                </span>
              )}
              {portfolioSummary.arcusCount > 0 && (
                <span className="rounded-full bg-card/85 px-2.5 py-1 font-bold text-muted ring-1 ring-divider/70">
                  {toFaDigits(portfolioSummary.arcusCount)} حساب آرکوس
                </span>
              )}
            </div>
          </div>

          {/* چیپ‌های دارایی‌های اصلی کیف پول با لوگو */}
          {portfolioSummary.topHoldings.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-divider/60 pt-3">
              <span className="flex items-center gap-1 text-[11px] font-bold text-muted">
                <Wallet className="h-3.5 w-3.5 text-accent" />
                دارایی‌های اصلی:
              </span>
              {portfolioSummary.topHoldings.map((h) => (
                <span
                  key={h.symbol}
                  className="inline-flex items-center gap-1.5 rounded-full bg-card/90 py-0.5 pe-2.5 ps-1 text-[11px] font-bold text-ink ring-1 ring-divider/75"
                >
                  <MarketAssetLogo symbol={h.symbol} size={18} />
                  <span dir="ltr">{h.symbol}</span>
                  <span className="text-[10px] font-semibold text-muted tabular-nums">
                    <MoneyValue value={h.valueUsd} />
                  </span>
                </span>
              ))}
            </div>
          ) : p.total === null ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider/60 pt-2.5 text-xs text-muted">
              <span>برای تحلیل موجودی شخصی، کیف پول متصل کنید؛ تحلیل بازارها همین الان آماده است.</span>
              <Link to="/wallets" className="font-bold text-accent hover:underline">
                افزودن کیف پول ←
              </Link>
            </div>
          ) : null}
        </div>
      </Surface>

      {/* ۲) پنل کشویی پروفایل ریسک و افق سرمایه‌گذاری با چیپ‌های سریع */}
      {profileOpen && (
        <Surface className="border border-accent/30 p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-extrabold text-ink">هدف، افق و ریسک‌پذیری شما</h3>
            </div>
            <span className="text-[11px] text-muted">در هر تحلیل به دستیار یادآوری می‌شود</span>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Field label="افق سرمایه‌گذاری">
                <Input
                  maxLength={100}
                  value={profile.horizon}
                  placeholder="مثلاً میان‌مدت (۶ تا ۱۲ ماه)"
                  onChange={(e) => setProfile((x) => ({ ...x, horizon: e.target.value }))}
                />
              </Field>
              <div className="flex flex-wrap gap-1">
                {HORIZON_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setProfile((x) => ({ ...x, horizon: preset }))}
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[10px] font-bold transition',
                      profile.horizon === preset
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-divider bg-surface-2/60 text-muted hover:text-ink'
                    )}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Field label="سطح ریسک‌پذیری">
                <Input
                  maxLength={100}
                  value={profile.risk}
                  placeholder="مثلاً متعادل"
                  onChange={(e) => setProfile((x) => ({ ...x, risk: e.target.value }))}
                />
              </Field>
              <div className="flex flex-wrap gap-1">
                {RISK_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setProfile((x) => ({ ...x, risk: preset }))}
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[10px] font-bold transition',
                      profile.risk === preset
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-divider bg-surface-2/60 text-muted hover:text-ink'
                    )}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <Field label="نیاز به نقدینگی / قفل هزینه زندگی">
              <Input
                maxLength={200}
                value={profile.liquidity}
                placeholder="مثلاً ۵۰۰۰ دلار ذخیره هزینه زندگی قفل بماند"
                onChange={(e) => setProfile((x) => ({ ...x, liquidity: e.target.value }))}
              />
            </Field>
          </div>
        </Surface>
      )}

      {/* ۳) فضای اصلی گفت‌وگو */}
      <Surface className="overflow-hidden border border-divider/85 shadow-sm">
        <div className="p-4 sm:p-5 space-y-5">
          {/* حالت شروع (بدون پیام): کارت‌های مأموریت ۱-کلیکی زیبا */}
          {messages.length === 0 ? (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-sky-500 to-emerald-500 text-white shadow-sm">
                  <Sparkles className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h2 className="text-base font-extrabold text-ink">از چه تحلیلی شروع کنیم؟</h2>
                  <p className="text-xs text-muted">
                    روی هر کارت بزنید تا مستقیم روی داده‌های واقعی پرتفولیو و بازار اجرا شود، یا سؤال خودتان را پایین بنویسید.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {STARTER_PROMPTS.map((sp) => {
                  const Icon = sp.icon;
                  return (
                    <button
                      key={sp.id}
                      type="button"
                      disabled={busy || !status}
                      onClick={() => void ask(sp.text)}
                      className={cn(
                        'group flex items-start gap-3 rounded-2xl border bg-gradient-to-bl p-3.5 text-start transition duration-150 hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50',
                        sp.accent
                      )}
                    >
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card/90 shadow-2xs ring-1 ring-black/5 dark:ring-white/10">
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-xs font-extrabold text-ink group-hover:text-accent">
                          {sp.label}
                        </p>
                        <p className="text-[11px] leading-5 text-muted">{sp.subtitle}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* جریان پیام‌های گفت‌وگو */
            <div className="space-y-4" aria-live="polite" aria-busy={busy}>
              {messages.map((m, i) => {
                const isUser = m.role === 'user';
                return (
                  <article
                    key={i}
                    className={cn(
                      'rounded-2xl p-4 transition',
                      isUser
                        ? 'ms-auto max-w-[92%] border border-accent/25 bg-accent/[0.07] sm:max-w-[82%]'
                        : 'border border-divider/80 bg-card shadow-2xs'
                    )}
                  >
                    <header className="mb-2.5 flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        {isUser ? (
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-[10px] font-black text-card">
                            ش
                          </span>
                        ) : (
                          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-sky-500 to-emerald-500 text-white shadow-2xs">
                            <Sparkles className="h-3.5 w-3.5" aria-hidden />
                          </span>
                        )}
                        <span className="font-extrabold text-ink">
                          {isUser ? 'شما' : 'دستیار هوشمند دارینو'}
                        </span>
                        <time
                          className="text-[10px] text-subtle"
                          dateTime={new Date(m.at).toISOString()}
                        >
                          {new Date(m.at).toLocaleTimeString('fa-IR', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </time>
                      </div>

                      {!isUser && (
                        <button
                          type="button"
                          onClick={() => void copyAnswer(m.text, i)}
                          className="inline-flex items-center gap-1 rounded-full bg-surface-2/80 px-2.5 py-1 text-[10px] font-bold text-muted transition hover:text-ink"
                        >
                          {copiedIdx === i ? (
                            <>
                              <Check className="h-3 w-3 text-positive" />
                              کپی شد
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              کپی
                            </>
                          )}
                        </button>
                      )}
                    </header>

                    {isUser ? (
                      <p className="text-sm leading-7 text-ink">{m.text}</p>
                    ) : (
                      <AssistantResponse text={m.text} />
                    )}
                  </article>
                );
              })}

              {/* چیپ‌های ادامه گفت‌وگو */}
              {!busy && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {STARTER_PROMPTS.map((sp) => (
                    <button
                      key={sp.id}
                      type="button"
                      disabled={!status}
                      onClick={() => void ask(sp.text)}
                      className="rounded-full border border-divider/80 bg-surface-2/60 px-2.5 py-1 text-[11px] font-bold text-muted transition hover:border-accent/50 hover:text-ink"
                    >
                      {sp.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* حالت در حال تحلیل */}
          {busy && (
            <div
              role="status"
              className="flex items-center gap-3 rounded-2xl border border-accent/25 bg-accent/[0.05] px-4 py-3 text-xs font-semibold text-ink"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <Sparkles className="h-4 w-4 animate-pulse" />
              </span>
              <div className="space-y-0.5">
                <p>در حال بررسی پرتفولیو، نقدینگی آزاد و بازارهای دارینو…</p>
                <p className="text-[11px] font-normal text-muted">پاسخ دقیق و مستند تا چند ثانیه دیگر آماده می‌شود</p>
              </div>
            </div>
          )}

          {error && <Notice tone="warn">{error}</Notice>}

          <div ref={chatEndRef} />
        </div>

        {/* نوار ارسال پیام مدرن (Composer) */}
        <div className="border-t border-divider/70 bg-surface-2/35 p-3.5 sm:p-4 space-y-2.5">
          <div className="relative rounded-2xl border border-divider/85 bg-card p-2 shadow-2xs focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
            <textarea
              aria-label="پرسش شما از دستیار پرتفولیو"
              className="w-full resize-none bg-transparent px-2.5 py-1.5 text-sm leading-7 text-ink placeholder:text-subtle outline-none"
              rows={2}
              maxLength={2000}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void ask();
                }
              }}
              placeholder="بپرسید… مثلاً: با نقدینگی آزادم چطور پله‌ای روی BTC، SOL و NVDA وارد شوم؟"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider/50 px-1.5 pt-2">
              <span className="text-[10px] text-subtle">
                ارسال سریع با <kbd dir="ltr" className="rounded bg-surface-2 px-1 py-0.5 font-mono">⌘/Ctrl + Enter</kbd>
              </span>
              <div className="flex items-center gap-1.5">
                {messages.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => setMessages([])}
                  >
                    پاک‌کردن
                  </Button>
                )}
                <Button
                  size="sm"
                  loading={busy}
                  icon={<Send className="h-3.5 w-3.5" />}
                  disabled={!question.trim() || !status}
                  onClick={() => void ask()}
                >
                  تحلیل با جمینای
                </Button>
              </div>
            </div>
          </div>

          {/* شفافیت داده‌های مبنا و حریم خصوصی (فشرده و بدون شلوغی) */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              فقط خلاصه مالی ارسال می‌شود (بدون آدرس کیف پول، کلید خصوصی یا هش تراکنش)
            </span>

            <div className="flex flex-wrap items-center gap-3">
              {lastContext && (
                <Disclosure
                  summary={
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-ink">
                      <Database className="h-3 w-3 text-accent" />
                      داده‌های مبنای پاسخ
                    </span>
                  }
                >
                  <ul className="mt-2 grid gap-1.5 text-[11px] sm:grid-cols-2 lg:grid-cols-3">
                    {lastContext.sections
                      .filter((s) => s.status !== 'interface')
                      .map((s) => (
                        <li
                          key={s.key}
                          className="flex min-w-0 justify-between gap-2 rounded-lg bg-card px-2.5 py-1.5 ring-1 ring-divider/70"
                        >
                          <span className="truncate font-semibold text-ink">{s.name}</span>
                          <span className="shrink-0 text-muted">{DATA_STATUS_FA[s.status] ?? s.status}</span>
                        </li>
                      ))}
                  </ul>
                </Disclosure>
              )}
            </div>
          </div>
        </div>
      </Surface>
    </Page>
  );
}
