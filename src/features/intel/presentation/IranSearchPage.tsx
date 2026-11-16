/** ============================================================
 * صفحهٔ «جست‌وجو» در بخش «بازار ایران» — جست‌وجوی هوشمند مکانی و مسیریابی نشان (Neshan MCP)
 *
 * قابلیت‌ها:
 *  ۱) دستیار هوشمند مکانی (گفت‌وگوی طبیعی فارسی ← فراخوانی ابزارهای سرور رسمی MCP نشان)
 *  ۲) جست‌وجوی صرافی‌ها، بانک‌ها، خودپردازها، داروخانه‌ها، پمپ‌بنزین‌ها و مراکز خدماتی
 *  ۳) مسیریابی خودرو، موتورسیکلت و پیاده با ترافیک لحظه‌ای، بدون ترافیک و الگوی معمول
 *  ۴) تبدیل آدرس به مختصات GPS و تبدیل مختصات به آدرس فارسی (Geocode / Reverse Geocode)
 *  ۵) بهینه‌سازی مسیر چند مقصدی (TSP)، ماتریس فاصله و محدوده دسترس‌پذیری زمانی (Isochrone)
 *  ۶) مقایسه چند مکان انتخابی، نمایش تصویر نقشه و لینک مستقیم باز کردن در اپلیکیشن/وب نشان
 *  ۷) اتصال دوطرفه با «صرافی‌های ایران»، «طلای ایران» و «دستیار پرتفولیو» دارینو
 * ============================================================ */
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeftRight,
  Building2,
  CheckCircle2,
  Clock,
  Coins,
  Compass,
  Copy,
  ExternalLink,
  Fuel,
  Layers,
  LocateFixed,
  MapPin,
  Navigation,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2
} from 'lucide-react';
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { Section, Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button, buttonClass } from '@/shared/components/ui/Button';
import { Input, Select } from '@/shared/components/ui/Input';
import { Tabs } from '@/shared/components/ui/SegmentedControl';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { AssistantResponse } from '@/features/connected/presentation/AssistantResponse';
import { cn } from '@/shared/lib/cn';
import { fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import { askNeshanSpatial, useNeshanStatus } from '../data/neshanApi';
import {
  GEO_ANCHORS,
  MCPFARSI_NESHAN_URL,
  NESHAN_MCP_TOOLS_CATALOG,
  NESHAN_PLATFORM_MCP_URL,
  buildNeshanDeeplink,
  type NeshanAskResponse,
  type NeshanPlaceItem,
  type NeshanToolPolicy
} from '../domain/neshanTools';

type ViewTab = 'assistant' | 'quick-tools' | 'mcp-architecture';

const VIEW_TABS = [
  { value: 'assistant' as const, label: 'دستیار مکانی و مسیریاب', icon: <Sparkles aria-hidden className="h-4 w-4" /> },
  { value: 'quick-tools' as const, label: 'محاسبه‌گر مسیر و مختصات', icon: <Route aria-hidden className="h-4 w-4" /> },
  { value: 'mcp-architecture' as const, label: 'وضعیت MCP و ۱۹ ابزار نشان', icon: <Layers aria-hidden className="h-4 w-4" /> }
];

const CITY_OPTIONS = [
  { slug: 'ahvaz', name: 'اهواز' },
  { slug: 'tehran', name: 'تهران' },
  { slug: 'isfahan', name: 'اصفهان' },
  { slug: 'mashhad', name: 'مشهد' },
  { slug: 'shiraz', name: 'شیراز' },
  { slug: 'tabriz', name: 'تبریز' },
  { slug: 'karaj', name: 'کرج' }
] as const;

interface PromptPreset {
  category: 'financial' | 'services' | 'routing';
  label: string;
  query: string;
}

const PROMPT_PRESETS: readonly PromptPreset[] = [
  {
    category: 'financial',
    label: 'صرافی‌های مرکز شهر اهواز',
    query: 'نزدیک‌ترین صرافی‌ها به مرکز شهر اهواز را پیدا کن.'
  },
  {
    category: 'financial',
    label: 'بانک‌ها و خودپردازهای کیانپارس',
    query: 'نزدیک‌ترین بانک‌ها و خودپردازها به کیانپارس اهواز کجاست؟'
  },
  {
    category: 'financial',
    label: 'صرافی‌های میدان فردوسی تهران',
    query: 'نزدیک‌ترین صرافی‌ها به میدان فردوسی تهران کجا هستند؟'
  },
  {
    category: 'services',
    label: 'پمپ بنزین و داروخانه گلستان اهواز',
    query: 'نزدیک‌ترین پمپ بنزین یا داروخانه به گلستان اهواز کجاست؟'
  },
  {
    category: 'services',
    label: 'محدوده ۱۵ دقیقه رانندگی (Isochrone)',
    query: 'در فاصله ۱۵ دقیقه رانندگی از کیانپارس اهواز، چه بانک‌ها و مراکز خدماتی قرار دارند؟'
  },
  {
    category: 'routing',
    label: 'زمان مسیر با ترافیک لحظه‌ای',
    query: 'با توجه به ترافیک فعلی، رسیدن از شهرک دانشگاه اهواز به کیانپارس اهواز چقدر زمان می‌برد؟'
  },
  {
    category: 'routing',
    label: 'بهترین ترتیب چند مقصد (TSP)',
    query: 'بهترین ترتیب مسیر برای مراجعه به فلکه ساعت اهواز، کیانپارس اهواز و زیتون کارمندی اهواز چیست؟'
  },
  {
    category: 'routing',
    label: 'تبدیل مختصات GPS به آدرس',
    query: 'این مختصات GPS مربوط به کدام خیابان یا منطقه است؟ 31.3203, 48.6842'
  }
];

const INTENT_BADGE_LABEL: Record<string, string> = {
  search_poi: 'جست‌وجوی مکان و کسب‌وکار (neshan_search)',
  routing: 'مسیریابی و ترافیک لحظه‌ای (neshan_direction)',
  reverse_geocode: 'تبدیل مختصات به آدرس (neshan_reverse_geocode)',
  geocode: 'تبدیل آدرس به مختصات (neshan_geocode)',
  isochrone: 'محدوده دسترس‌پذیری زمانی (neshan_isochrone)',
  tsp: 'بهینه‌سازی مسیر چند مقصدی (neshan_tsp)',
  distance_matrix: 'ماتریس فاصله و زمان سفر (neshan_distance_matrix)',
  traffic: 'تحلیل الگوی ترافیک ۲۴ ساعته (neshan_traffic_analytics)'
};

export default function IranSearchPage() {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab');
  const activeTab: ViewTab =
    rawTab === 'quick-tools' || rawTab === 'mcp-architecture' ? rawTab : 'assistant';

  const initialQueryFromUrl = params.get('q') ?? '';
  const [queryText, setQueryText] = useState(initialQueryFromUrl);
  const [citySlug, setCitySlug] = useState<string>('ahvaz');
  const [userGps, setUserGps] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NeshanAskResponse | null>(null);
  const [history, setHistory] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [comparedPlaces, setComparedPlaces] = useState<NeshanPlaceItem[]>([]);
  const [copiedCoord, setCopiedCoord] = useState<string | null>(null);

  // فیلتر جدول ۱۹ ابزار در تب معماری
  const [toolPolicyFilter, setToolPolicyFilter] = useState<'all' | NeshanToolPolicy>('all');

  // ابزار سریع مسیریابی و تبدیل مختصات
  const [originAnchorId, setOriginAnchorId] = useState('ahvaz-daneshgah');
  const [destAnchorId, setDestAnchorId] = useState('ahvaz-kianpars');
  const [vehicleMode, setVehicleMode] = useState<'car' | 'motorcycle' | 'pedestrian'>('car');
  const [trafficMode, setTrafficMode] = useState<'live' | 'no_traffic' | 'typical'>('live');
  const [coordInputLat, setCoordInputLat] = useState('31.3203');
  const [coordInputLng, setCoordInputLng] = useState('48.6842');

  const statusQuery = useNeshanStatus();
  const statusData = statusQuery.data;

  async function runSpatialQuery(q: string) {
    const clean = q.trim();
    if (clean.length < 2) {
      setError('لطفاً پرسش مکانی یا آدرس موردنظر خود را وارد کنید.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await askNeshanSpatial({
        query: clean,
        citySlug,
        userLocation: userGps,
        history: history.slice(-4)
      });
      setResult(res);
      setHistory((prev) => [
        ...prev.slice(-6),
        { role: 'user', text: clean },
        { role: 'assistant', text: res.answer }
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در اجرای جست‌وجوی مکانی');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!initialQueryFromUrl) return;
    setQueryText(initialQueryFromUrl);
    void runSpatialQuery(initialQueryFromUrl);
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.delete('q');
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQueryFromUrl]);

  function detectUserGps() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsError('مرورگر شما از دریافت موقعیت مکانی (GPS) پشتیبانی نمی‌کند.');
      return;
    }
    setGpsBusy(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsBusy(false);
        setUserGps({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          label: 'موقعیت GPS دستگاه من'
        });
      },
      () => {
        setGpsBusy(false);
        setGpsError('دسترسی به موقعیت مکانی داده نشد؛ می‌توانید شهر یا محله را در متن بنویسید.');
      },
      { enableHighAccuracy: true, timeout: 8_000 }
    );
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    void runSpatialQuery(queryText);
  }

  function toggleComparePlace(place: NeshanPlaceItem) {
    setComparedPlaces((prev) => {
      const exists = prev.some((p) => p.title === place.title && Math.abs(p.lat - place.lat) < 0.0001);
      if (exists) return prev.filter((p) => !(p.title === place.title && Math.abs(p.lat - place.lat) < 0.0001));
      return [...prev.slice(-3), place];
    });
  }

  function copyCoordinates(lat: number, lng: number) {
    const str = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(str);
      setCopiedCoord(str);
      setTimeout(() => setCopiedCoord(null), 2000);
    }
  }

  const filteredTools = useMemo(() => {
    const list = statusData?.tools ?? NESHAN_MCP_TOOLS_CATALOG;
    if (toolPolicyFilter === 'all') return list;
    return list.filter((t) => t.policy === toolPolicyFilter);
  }, [statusData?.tools, toolPolicyFilter]);

  return (
    <Page>
      <PageHeader
        eyebrow={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Compass className="h-4 w-4 text-accent" aria-hidden />
            <span>بازار ایران · سرور رسمی MCP نقشه نشان (Official Partner در mcpfarsi)</span>
          </span>
        }
        title="جست‌وجوی مکانی و مسیریابی هوشمند"
        meta={
          <div className="space-y-2">
            <p className="max-w-3xl text-sm leading-7 text-muted">
              اتصال مستقیم دستیار هوش مصنوعی دارینو به نقشه، اطلاعات مکانی، ترافیک لحظه‌ای و سرویس مسیریابی نشان. پرسش خود را به زبان فارسی بنویسید تا نزدیک‌ترین صرافی‌ها، بانک‌ها، خودپردازها، مراکز خدماتی و بهترین مسیرها با داده واقعی نشان بررسی شوند.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <Badge tone={statusData?.neshanKeyConfigured ? 'gain' : 'warn'}>
                {statusData?.neshanKeyConfigured ? 'متصل به سرور MCP نشان (کلید فعال)' : 'در انتظار تنظیم NESHAN_API_KEY در سرور'}
              </Badge>
              <Badge tone="info">
                {toFaDigits(statusData?.activeToolsCount ?? 11)} ابزار فعال از {toFaDigits(statusData?.totalCatalogToolsCount ?? 19)} ابزار نشان
              </Badge>
              <a
                href={NESHAN_PLATFORM_MCP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-divider bg-card px-2.5 py-0.5 text-muted transition hover:border-accent hover:text-accent"
              >
                مستندات پلتفرم نشان <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
              <a
                href={MCPFARSI_NESHAN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-divider bg-card px-2.5 py-0.5 text-muted transition hover:border-accent hover:text-accent"
              >
                سرور نشان در mcpfarsi <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            </div>
          </div>
        }
      />

      <Tabs
        options={VIEW_TABS}
        value={activeTab}
        onChange={(t) => setParams(t === 'assistant' ? {} : { tab: t }, { replace: true })}
        label="بخش‌های جست‌وجوی هوشمند نشان"
      />

      {activeTab === 'assistant' && (
        <div className="space-y-6">
          {/* کادر پرسش به زبان طبیعی فارسی */}
          <Surface variant="focal" className="space-y-4 p-4 md:p-5">
            <form onSubmit={handleFormSubmit} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="neshan-spatial-input" className="text-sm font-bold text-ink">
                  درخواست مکانی یا مسیریابی به زبان طبیعی فارسی
                </label>
                <span className="text-2xs text-subtle">
                  پردازش از طریق سرور رسمی MCP نشان · بدون افشای کلید در مرورگر
                </span>
              </div>

              <textarea
                id="neshan-spatial-input"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void runSpatialQuery(queryText);
                  }
                }}
                rows={2}
                maxLength={600}
                placeholder="مثلاً: نزدیک‌ترین صرافی‌ها به مرکز شهر اهواز را پیدا کن، یا با توجه به ترافیک فعلی رسیدن از شهرک دانشگاه به کیانپارس چقدر زمان می‌برد؟"
                className="w-full resize-none rounded-field border border-divider-strong bg-card px-3.5 py-2.5 text-sm leading-7 text-ink placeholder:text-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />

              <div className="flex flex-wrap items-center gap-2.5">
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  <span>شهر پیش‌فرض:</span>
                  <Select
                    value={citySlug}
                    onChange={(e) => setCitySlug(e.target.value)}
                    className="h-9 w-28 text-xs"
                    aria-label="شهر پیش‌فرض جست‌وجو"
                  >
                    {CITY_OPTIONS.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </label>

                <Button
                  type="button"
                  size="sm"
                  variant={userGps ? 'secondary' : 'outline'}
                  loading={gpsBusy}
                  icon={<LocateFixed className="h-3.5 w-3.5" aria-hidden />}
                  onClick={detectUserGps}
                >
                  {userGps
                    ? `GPS فعال (${toFaDigits(userGps.lat.toFixed(3))}, ${toFaDigits(userGps.lng.toFixed(3))})`
                    : 'موقعیت فعلی من (GPS)'}
                </Button>

                {userGps && (
                  <button
                    type="button"
                    onClick={() => setUserGps(null)}
                    className="text-2xs text-muted underline hover:text-ink"
                  >
                    حذف GPS
                  </button>
                )}

                <div className="ms-auto flex items-center gap-2">
                  {history.length > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setHistory([]);
                        setResult(null);
                      }}
                    >
                      پاک‌کردن نشست
                    </Button>
                  )}
                  <Button
                    type="submit"
                    loading={loading}
                    icon={<Search className="h-4 w-4" aria-hidden />}
                  >
                    جست‌وجو و تحلیل مکانی
                  </Button>
                </div>
              </div>
            </form>

            {gpsError && <Notice tone="warn">{gpsError}</Notice>}

            {/* نمونه پرسش‌های کاربردی طبقه‌بندی‌شده */}
            <div className="space-y-2 border-t border-divider pt-3">
              <p className="text-2xs font-semibold text-subtle">
                نمونه کاربردهای آماده (روی هر مورد بزنید تا دستیار اجرا کند):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {PROMPT_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setQueryText(preset.query);
                      void runSpatialQuery(preset.query);
                    }}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition',
                      preset.category === 'financial'
                        ? 'border-accent/40 bg-accent-soft/40 font-semibold text-ink hover:border-accent'
                        : 'border-divider bg-card text-muted hover:border-accent hover:text-accent'
                    )}
                  >
                    {preset.category === 'financial' ? (
                      <Coins className="h-3 w-3 text-accent" aria-hidden />
                    ) : preset.category === 'routing' ? (
                      <Navigation className="h-3 w-3 text-positive" aria-hidden />
                    ) : (
                      <Fuel className="h-3 w-3 text-warn" aria-hidden />
                    )}
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </Surface>

          {error && (
            <Notice
              tone="error"
              title="خطا در دریافت پاسخ مکانی"
              action={
                <Button size="sm" variant="outline" onClick={() => void runSpatialQuery(queryText)}>
                  تلاش دوباره
                </Button>
              }
            >
              {error}
            </Notice>
          )}

          {loading && (
            <div className="space-y-3" aria-busy="true" aria-label="در حال فراخوانی ابزارهای MCP نشان">
              <Surface className="flex items-center gap-3 p-4">
                <Sparkles className="h-5 w-5 animate-pulse text-accent" aria-hidden />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-ink">
                    در حال تحلیل درخواست و فراخوانی ابزارهای سرور MCP نشان…
                  </p>
                  <p className="text-xs text-muted">
                    بررسی موقعیت جغرافیایی، نقاط اطراف و وضعیت ترافیک لحظه‌ای در شبکه راه نشان
                  </p>
                </div>
              </Surface>
              <Skeleton className="h-36 rounded-card" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Skeleton className="h-28 rounded-card" />
                <Skeleton className="h-28 rounded-card" />
              </div>
            </div>
          )}

          {!loading && !result && !error && (
            <EmptyState
              icon={<MapPin />}
              message="پرسش مکانی، آدرس یا مسیر موردنظر خود را به فارسی بنویسید"
              hint="پیدا کردن نزدیک‌ترین صرافی، بانک، خودپرداز، پمپ بنزین یا داروخانه، محاسبه زمان مسیر با ترافیک لحظه‌ای، تبدیل مختصات GPS به آدرس و بهینه‌سازی ترتیب مراجعه به چند مقصد."
            />
          )}

          {/* نمایش نتایج کامل دستیار و ابزارهای نشان */}
          {result && !loading && (
            <div className="space-y-5">
              {/* نوار متادیتای شفاف منبع داده، ابزار فراخوانی‌شده و زمان دریافت */}
              <Surface className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info">
                    {INTENT_BADGE_LABEL[result.analysis.intent] ?? result.analysis.intent}
                  </Badge>
                  {result.analysis.isFinancialRelated && result.analysis.financialCategoryFa && (
                    <Badge tone="gain">{result.analysis.financialCategoryFa}</Badge>
                  )}
                  {result.toolTraces.map((trace, idx) => (
                    <Badge
                      key={`${trace.tool}-${idx}`}
                      tone={trace.status === 'ok' ? 'gain' : trace.status === 'unconfigured' ? 'warn' : 'loss'}
                    >
                      ابزار: {trace.tool} ({trace.status === 'ok' ? `${toFaDigits(trace.durationMs)}ms` : trace.status === 'unconfigured' ? 'کلید تنظیم نشده' : 'خطا'})
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-2xs text-subtle">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  <span>
                    منبع: سرور MCP نشان · دریافت: {fmtRelativeAge(result.sourceMeta.fetchedAt)} (
                    {new Date(result.sourceMeta.fetchedAt).toLocaleTimeString('fa-IR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })}
                    )
                  </span>
                </div>
              </Surface>

              {/* پاسخ تحلیلی دستیار هوش مصنوعی دارینو */}
              <Section title="پاسخ دستیار هوشمند مکانی دارینو">
                <Surface className="space-y-4 p-4 md:p-5">
                  <AssistantResponse text={result.answer} />

                  {/* دکمه‌های باز کردن مستقیم در نقشه و مسیریاب نشان */}
                  {result.deeplinks.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-divider pt-3">
                      {result.deeplinks.map((dl, idx) => (
                        <div key={idx} className="flex flex-wrap items-center gap-2">
                          <a
                            href={dl.searchWebUrl ?? dl.webUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(buttonClass('primary', 'sm'), 'gap-1.5')}
                          >
                            <MapPin className="h-3.5 w-3.5" aria-hidden />
                            {dl.linkType === 'routing'
                              ? 'مشاهده و شروع مسیریابی زنده در نقشه نشان'
                              : `مشاهده «${result.analysis.searchTerm || 'موقعیت'}» روی نقشه نشان`}
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          </a>
                          <a
                            href={dl.androidAndWebUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(buttonClass('outline', 'sm'), 'gap-1.5')}
                          >
                            باز کردن در اپلیکیشن نشان <ExternalLink className="h-3 w-3" aria-hidden />
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </Surface>
              </Section>

              {/* کارت جزئیات مسیر و ترافیک لحظه‌ای (اگر مسیریابی انجام شده باشد) */}
              {result.route && (
                <Section title="جزئیات مسیر و ترافیک لحظه‌ای نشان">
                  <Surface variant="focal" className="space-y-4 p-4 md:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-muted">
                          مسیر {result.route.vehicle === 'car' ? 'خودرو' : result.route.vehicle === 'motorcycle' ? 'موتورسیکلت' : 'پیاده'} · حالت ترافیک: {result.route.trafficMode === 'live' ? 'لحظه‌ای زنده' : result.route.trafficMode === 'no_traffic' ? 'بدون ترافیک' : 'الگوی معمول'}
                        </p>
                        <h3 className="mt-1 text-base font-extrabold text-ink">
                          {result.route.originTitle} ← {result.route.destTitle}
                        </h3>
                      </div>
                      <a
                        href={result.route.deeplink.webUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(buttonClass('primary', 'sm'), 'gap-1.5')}
                      >
                        مسیریابی گام‌به‌گام در نشان <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </a>
                    </div>

                    <dl className="grid grid-cols-2 gap-3 border-t border-divider pt-3 sm:grid-cols-3">
                      <div>
                        <dt className="text-2xs text-muted">زمان سفر با ترافیک</dt>
                        <dd className="mt-1 text-lg font-extrabold text-positive">
                          {toFaDigits(result.route.durationText)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-2xs text-muted">مسافت مسیر</dt>
                        <dd className="mt-1 text-lg font-extrabold text-ink">
                          {toFaDigits(result.route.distanceText)}
                        </dd>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <dt className="text-2xs text-muted">خلاصه محور اصلی</dt>
                        <dd className="mt-1 text-sm font-bold text-ink">
                          {toFaDigits(result.route.summaryText)}
                        </dd>
                      </div>
                    </dl>

                    {result.route.steps.length > 0 && (
                      <Disclosure summary={`گام‌های مسیر (${toFaDigits(result.route.steps.length)} مرحله)`}>
                        <ol className="list-decimal space-y-1.5 ps-5 pt-2 text-xs leading-6 text-muted">
                          {result.route.steps.map((st, idx) => (
                            <li key={idx}>
                              <span className="font-semibold text-ink">{toFaDigits(st.instruction)}</span>
                              {(st.distanceText || st.durationText) && (
                                <span className="text-subtle">
                                  {' '}
                                  ({toFaDigits([st.distanceText, st.durationText].filter(Boolean).join(' · '))})
                                </span>
                              )}
                            </li>
                          ))}
                        </ol>
                      </Disclosure>
                    )}
                  </Surface>
                </Section>
              )}

              {/* کارت تبدیل مختصات به آدرس فارسی (Reverse Geocode) */}
              {result.reverseAddress && (
                <Section title="نتیجه تبدیل مختصات GPS به آدرس فارسی (neshan_reverse_geocode)">
                  <Surface className="flex flex-wrap items-center justify-between gap-4 p-4">
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-ink">{toFaDigits(result.reverseAddress.formattedAddress)}</p>
                      <p className="text-xs text-muted">
                        {[
                          result.reverseAddress.state && `استان: ${result.reverseAddress.state}`,
                          result.reverseAddress.city && `شهر: ${result.reverseAddress.city}`,
                          result.reverseAddress.neighbourhood && `محله: ${result.reverseAddress.neighbourhood}`,
                          result.reverseAddress.routeName && `معبر: ${result.reverseAddress.routeName}`
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      <p className="num-ltr text-2xs text-subtle">
                        GPS: {result.reverseAddress.lat.toFixed(6)}, {result.reverseAddress.lng.toFixed(6)}
                      </p>
                    </div>
                    <a
                      href={result.reverseAddress.deeplink.webUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(buttonClass('outline', 'sm'), 'gap-1.5')}
                    >
                      نمایش نقطه روی نقشه نشان <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  </Surface>
                </Section>
              )}

              {/* کارت محدوده دسترس‌پذیری زمانی (Isochrone) */}
              {result.isochrone && (
                <Section title="محدوده دسترس‌پذیری زمانی و مسافتی (neshan_isochrone)">
                  <Surface className="space-y-2 p-4">
                    <p className="text-sm font-bold text-ink">
                      مرکز شعاع دسترسی: {result.isochrone.centerTitle}
                    </p>
                    <p className="text-xs text-muted">
                      {result.isochrone.timeMinutes
                        ? `بازه زمانی: ${toFaDigits(result.isochrone.timeMinutes)} دقیقه رانندگی`
                        : ''}
                      {result.isochrone.distanceKm
                        ? ` · شعاع مسافتی: ${toFaDigits(result.isochrone.distanceKm)} کیلومتر`
                        : ''}
                      {result.isochrone.polygonCoordinatesCount > 0
                        ? ` · تعداد رئوس چندضلعی ایزوکرون دریافت‌شده از نشان: ${toFaDigits(result.isochrone.polygonCoordinatesCount)} نقطه`
                        : ''}
                    </p>
                  </Surface>
                </Section>
              )}

              {/* فهرست مکان‌های یافت‌شده از نشان + امکان مسیریابی و مقایسه */}
              {result.places.length > 0 && (
                <Section
                  title={`${toFaDigits(result.places.length)} مکان دریافت‌شده از نقشه نشان`}
                  description="می‌توانید برای هر مکان مستقیماً درخواست مسیریابی با ترافیک لحظه‌ای بدهید یا چند مکان را برای مقایسه انتخاب کنید."
                >
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {result.places.map((place, idx) => {
                      const isCompared = comparedPlaces.some(
                        (p) => p.title === place.title && Math.abs(p.lat - place.lat) < 0.0001
                      );
                      return (
                        <li key={`${place.title}-${idx}`}>
                          <Surface className="flex h-full flex-col justify-between gap-3 p-4">
                            <div className="space-y-1.5">
                              <div className="flex items-start justify-between gap-2">
                                <h4 className="text-sm font-extrabold text-ink">
                                  {toFaDigits(idx + 1)}. {place.title}
                                </h4>
                                {place.category && (
                                  <Badge tone="neutral">{place.category}</Badge>
                                )}
                              </div>
                              <p className="text-xs leading-6 text-muted">{toFaDigits(place.address)}</p>
                              <div className="flex flex-wrap items-center gap-2 pt-1 text-2xs text-subtle">
                                {place.neighbourhood && <span>محله: {place.neighbourhood}</span>}
                                {place.distanceMeters != null && (
                                  <span className="font-semibold text-ink">
                                    فاصله خطی: {toFaDigits(place.distanceMeters)} متر
                                  </span>
                                )}
                                {place.durationMinutes != null && (
                                  <span className="text-positive">
                                    تخمین اولیه: ~{toFaDigits(place.durationMinutes)} دقیقه
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 border-t border-divider pt-3">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                icon={<Navigation className="h-3.5 w-3.5" aria-hidden />}
                                onClick={() => {
                                  const originLabel =
                                    userGps?.label ??
                                    result.analysis.anchors[0]?.nameFa ??
                                    'مرکز شهر اهواز';
                                  const q = `با توجه به ترافیک فعلی، مسیر و زمان رسیدن از ${originLabel} به ${place.title} (${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}) چقدر است؟`;
                                  setQueryText(q);
                                  void runSpatialQuery(q);
                                }}
                              >
                                مسیریابی تا اینجا
                              </Button>

                              <Button
                                type="button"
                                size="sm"
                                variant={isCompared ? 'primary' : 'outline'}
                                onClick={() => toggleComparePlace(place)}
                              >
                                {isCompared ? 'در جدول مقایسه ✓' : 'مقایسه مکان'}
                              </Button>

                              <button
                                type="button"
                                onClick={() => copyCoordinates(place.lat, place.lng)}
                                className="inline-flex items-center gap-1 rounded-control border border-divider px-2 py-1 text-2xs text-muted hover:text-ink"
                                title="کپی مختصات GPS"
                              >
                                <Copy className="h-3 w-3" aria-hidden />
                                {copiedCoord === `${place.lat.toFixed(6)}, ${place.lng.toFixed(6)}`
                                  ? 'کپی شد'
                                  : 'GPS'}
                              </button>

                              <a
                                href={place.deeplink.webUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ms-auto inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                              >
                                نقشه نشان <ExternalLink className="h-3 w-3" aria-hidden />
                              </a>
                            </div>
                          </Surface>
                        </li>
                      );
                    })}
                  </ul>
                </Section>
              )}

              {/* جدول مقایسه چند مکان انتخابی */}
              {comparedPlaces.length > 0 && (
                <Section
                  title={`مقایسه مکان‌های انتخابی (${toFaDigits(comparedPlaces.length)} مکان)`}
                  action={
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />}
                      onClick={() => setComparedPlaces([])}
                    >
                      پاک‌کردن مقایسه
                    </Button>
                  }
                >
                  <Surface className="overflow-x-auto p-3">
                    <table className="w-full border-separate border-spacing-0 text-xs">
                      <thead>
                        <tr className="text-muted">
                          <th className="border-b border-divider px-2.5 py-2 text-start font-semibold">نام مکان</th>
                          <th className="border-b border-divider px-2.5 py-2 text-start font-semibold">محله / آدرس</th>
                          <th className="border-b border-divider px-2.5 py-2 text-start font-semibold">فاصله تقریبی</th>
                          <th className="border-b border-divider px-2.5 py-2 text-start font-semibold">مختصات GPS</th>
                          <th className="border-b border-divider px-2.5 py-2 text-start font-semibold">عملیات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparedPlaces.map((cp, i) => (
                          <tr key={`${cp.title}-${i}`}>
                            <td className="border-b border-divider px-2.5 py-2 font-bold text-ink">{cp.title}</td>
                            <td className="border-b border-divider px-2.5 py-2 text-muted">{toFaDigits(cp.address)}</td>
                            <td className="border-b border-divider px-2.5 py-2 text-ink">
                              {cp.distanceMeters != null ? `${toFaDigits(cp.distanceMeters)} متر` : '—'}
                            </td>
                            <td className="num-ltr border-b border-divider px-2.5 py-2 text-subtle">
                              {cp.lat.toFixed(4)}, {cp.lng.toFixed(4)}
                            </td>
                            <td className="border-b border-divider px-2.5 py-2">
                              <a
                                href={cp.deeplink.webUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-accent hover:underline"
                              >
                                باز کردن <ExternalLink className="h-3 w-3" aria-hidden />
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {comparedPlaces.length >= 2 && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-1">
                        <p className="text-2xs text-muted">
                          می‌خواهید بهترین ترتیب سر زدن به این {toFaDigits(comparedPlaces.length)} مکان را با ابزار TSP نشان محاسبه کنید؟
                        </p>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            const names = comparedPlaces.map((p) => `${p.title} (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)})`).join('، ');
                            const q = `بهترین ترتیب مسیر برای مراجعه به این مکان‌ها چیست؟ ${names}`;
                            setQueryText(q);
                            void runSpatialQuery(q);
                          }}
                        >
                          محاسبه بهترین ترتیب مراجعه (TSP)
                        </Button>
                      </div>
                    )}
                  </Surface>
                </Section>
              )}

              {/* تصویر نقشه استاتیک از پروکسی امن سمت سرور (در صورت فعال بودن کلید) */}
              {result.staticMapProxyUrl && result.sourceMeta.liveDataVerified && (
                <Section title="پیش‌نمایش نقشه محدوده از سرور نشان (neshan_static_map)">
                  <Surface className="overflow-hidden p-3">
                    <img
                      src={result.staticMapProxyUrl}
                      alt={`نقشه محدوده ${result.query}`}
                      loading="lazy"
                      className="mx-auto max-h-80 w-full rounded-field object-cover"
                    />
                  </Surface>
                </Section>
              )}

              {/* پل ارتباطی هوشمند با دستیار مالی و بخش‌های بازار ایران دارینو */}
              <Section
                title="اتصال به ابزارهای مالی و بازار ایران دارینو"
                description="پس از یافتن صرافی، بانک یا مرکز معامله، نرخ‌های لحظه‌ای و تحلیل مالی را در بخش‌های تخصصی دارینو بررسی کنید."
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <Surface className="flex flex-col justify-between gap-3 p-4">
                    <div className="space-y-1">
                      <p className="inline-flex items-center gap-1.5 text-sm font-bold text-ink">
                        <ArrowLeftRight className="h-4 w-4 text-accent" aria-hidden />
                        صرافی‌های ایران (نرخ تتر و رمزارز)
                      </p>
                      <p className="text-xs leading-6 text-muted">
                        پیش از مراجعه حضوری به صرافی، بهترین قیمت خرید و فروش تتر و اسپرد ۱۱ صرافی آنلاین ایرانی را مقایسه کنید.
                      </p>
                    </div>
                    <Link to="/exchanges" className={cn(buttonClass('outline', 'sm'), 'self-start')}>
                      مشاهده صرافی‌های ایران
                    </Link>
                  </Surface>

                  <Surface className="flex flex-col justify-between gap-3 p-4">
                    <div className="space-y-1">
                      <p className="inline-flex items-center gap-1.5 text-sm font-bold text-ink">
                        <Coins className="h-4 w-4 text-warn" aria-hidden />
                        طلای ایران و حباب سکه
                      </p>
                      <p className="text-xs leading-6 text-muted">
                        مقایسه قیمت طلای ۱۸ عیار و سکه در بازار آزاد و پلتفرم‌های آنلاین نسبت به ارزش ذاتی انس جهانی.
                      </p>
                    </div>
                    <Link to="/gold" className={cn(buttonClass('outline', 'sm'), 'self-start')}>
                      بررسی طلای ایران
                    </Link>
                  </Surface>

                  <Surface className="flex flex-col justify-between gap-3 p-4">
                    <div className="space-y-1">
                      <p className="inline-flex items-center gap-1.5 text-sm font-bold text-ink">
                        <Sparkles className="h-4 w-4 text-positive" aria-hidden />
                        دستیار مالی و پرتفولیو دارینو
                      </p>
                      <p className="text-xs leading-6 text-muted">
                        تحلیل جامع سبد دارایی، نقدینگی دلاری/تومانی و تصمیم‌گیری مالی با دستیار هوش مصنوعی دارینو.
                      </p>
                    </div>
                    <Link to="/assistant" className={cn(buttonClass('outline', 'sm'), 'self-start')}>
                      ورود به دستیار پرتفولیو
                    </Link>
                  </Surface>
                </div>
              </Section>
            </div>
          )}
        </div>
      )}

      {/* زبانه ۲: محاسبه‌گر سریع مسیر و تبدیل مختصات */}
      {activeTab === 'quick-tools' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Section
            title="مسیریابی و تخمین زمان سفر با ترافیک نشان"
            description="مبدأ، مقصد، وسیله نقلیه و حالت ترافیک را انتخاب کنید تا دستیار مسیر را محاسبه کند یا در نقشه نشان باز نماید."
          >
            <Surface className="space-y-4 p-4 md:p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-semibold text-muted">
                  <span>نقطه مبدأ</span>
                  <Select
                    value={originAnchorId}
                    onChange={(e) => setOriginAnchorId(e.target.value)}
                    aria-label="نقطه مبدأ"
                  >
                    {GEO_ANCHORS.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nameFa}
                      </option>
                    ))}
                  </Select>
                </label>

                <label className="space-y-1 text-xs font-semibold text-muted">
                  <span>نقطه مقصد</span>
                  <Select
                    value={destAnchorId}
                    onChange={(e) => setDestAnchorId(e.target.value)}
                    aria-label="نقطه مقصد"
                  >
                    {GEO_ANCHORS.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nameFa}
                      </option>
                    ))}
                  </Select>
                </label>

                <label className="space-y-1 text-xs font-semibold text-muted">
                  <span>وسیله نقلیه</span>
                  <Select
                    value={vehicleMode}
                    onChange={(e) => setVehicleMode(e.target.value as 'car' | 'motorcycle' | 'pedestrian')}
                    aria-label="وسیله نقلیه"
                  >
                    <option value="car">خودرو سواری (car)</option>
                    <option value="motorcycle">موتورسیکلت (motorcycle)</option>
                    <option value="pedestrian">پیاده (pedestrian)</option>
                  </Select>
                </label>

                <label className="space-y-1 text-xs font-semibold text-muted">
                  <span>حالت محاسبه ترافیک</span>
                  <Select
                    value={trafficMode}
                    onChange={(e) => setTrafficMode(e.target.value as 'live' | 'no_traffic' | 'typical')}
                    aria-label="حالت ترافیک"
                  >
                    <option value="live">ترافیک لحظه‌ای زنده (live)</option>
                    <option value="no_traffic">بدون ترافیک (no_traffic)</option>
                    <option value="typical">الگوی معمول ترافیک (typical)</option>
                  </Select>
                </label>
              </div>

              {(() => {
                const orig = GEO_ANCHORS.find((a) => a.id === originAnchorId) ?? GEO_ANCHORS[0];
                const dest = GEO_ANCHORS.find((a) => a.id === destAnchorId) ?? GEO_ANCHORS[1];
                const dl = buildNeshanDeeplink({
                  linkType: 'routing',
                  originLat: orig.lat,
                  originLng: orig.lng,
                  destLat: dest.lat,
                  destLng: dest.lng,
                  vehicle: vehicleMode
                });
                const vehicleFa = vehicleMode === 'car' ? 'خودرو' : vehicleMode === 'motorcycle' ? 'موتورسیکلت' : 'پیاده';
                const trafficFa = trafficMode === 'live' ? 'با ترافیک فعلی' : trafficMode === 'no_traffic' ? 'بدون ترافیک' : 'با ترافیک معمول';

                return (
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <Button
                      type="button"
                      icon={<Route className="h-4 w-4" aria-hidden />}
                      onClick={() => {
                        const q = `مسیر ${vehicleFa} ${trafficFa} از ${orig.nameFa} به ${dest.nameFa} چقدر زمان می‌برد و چه مسافتی دارد؟`;
                        setQueryText(q);
                        setParams({}, { replace: true });
                        void runSpatialQuery(q);
                      }}
                    >
                      محاسبه با دستیار MCP نشان
                    </Button>
                    <a
                      href={dl.webUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(buttonClass('outline', 'md'), 'gap-1.5')}
                    >
                      باز کردن مستقیم مسیر در نشان <ExternalLink className="h-4 w-4" aria-hidden />
                    </a>
                  </div>
                );
              })()}
            </Surface>
          </Section>

          <Section
            title="تبدیل مختصات GPS به آدرس فارسی (Reverse Geocode)"
            description="عرض و طول جغرافیایی (lat, lng) را وارد کنید تا نام خیابان، محله و شهر از نقشه نشان استعلام شود."
          >
            <Surface className="space-y-4 p-4 md:p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-semibold text-muted">
                  <span>عرض جغرافیایی (Latitude)</span>
                  <Input
                    dir="ltr"
                    value={coordInputLat}
                    onChange={(e) => setCoordInputLat(e.target.value)}
                    placeholder="31.3203"
                  />
                </label>
                <label className="space-y-1 text-xs font-semibold text-muted">
                  <span>طول جغرافیایی (Longitude)</span>
                  <Input
                    dir="ltr"
                    value={coordInputLng}
                    onChange={(e) => setCoordInputLng(e.target.value)}
                    placeholder="48.6842"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button
                  type="button"
                  icon={<MapPin className="h-4 w-4" aria-hidden />}
                  onClick={() => {
                    const lat = Number(coordInputLat) || 31.3203;
                    const lng = Number(coordInputLng) || 48.6842;
                    const q = `این مختصات GPS مربوط به کدام خیابان یا منطقه است؟ ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
                    setQueryText(q);
                    setParams({}, { replace: true });
                    void runSpatialQuery(q);
                  }}
                >
                  استعلام آدرس از MCP نشان
                </Button>
                <a
                  href={
                    buildNeshanDeeplink({
                      linkType: 'point',
                      lat: Number(coordInputLat) || 31.3203,
                      lng: Number(coordInputLng) || 48.6842
                    }).webUrl
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonClass('outline', 'md'), 'gap-1.5')}
                >
                  نمایش مختصات در نقشه نشان <ExternalLink className="h-4 w-4" aria-hidden />
                </a>
              </div>
            </Surface>
          </Section>
        </div>
      )}

      {/* زبانه ۳: معماری اتصال، امنیت کلید و ممیزی ۱۹ ابزار MCP نشان */}
      {activeTab === 'mcp-architecture' && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Surface className="space-y-2 p-4">
              <p className="inline-flex items-center gap-1.5 text-xs font-bold text-accent">
                <ShieldCheck className="h-4 w-4" aria-hidden />
                امنیت کلید و معماری سمت سرور
              </p>
              <p className="text-sm font-extrabold text-ink">
                {statusData?.neshanKeyConfigured ? 'کلید NESHAN_API_KEY فعال است' : 'کلید NESHAN_API_KEY تنظیم نشده'}
              </p>
              <p className="text-xs leading-6 text-muted">
                کلید API نشان صرفاً در متغیر محیطی سمت سرور (`process.env.NESHAN_API_KEY`) نگهداری می‌شود و در هدر `Api-Key` به سرور MCP نشان ارسال می‌گردد؛ هیچ کلیدی در باندل فرانت‌اند قرار نمی‌گیرد.
              </p>
            </Surface>

            <Surface className="space-y-2 p-4">
              <p className="inline-flex items-center gap-1.5 text-xs font-bold text-positive">
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                مدیریت سهمیه، کش و هزینه API
              </p>
              <p className="text-sm font-extrabold text-ink">
                سقف {toFaDigits(statusData?.quota.perMinuteLimit ?? 20)} درخواست در دقیقه · کش دولایه
              </p>
              <p className="text-xs leading-6 text-muted">
                نتایج جست‌وجو و تبدیل آدرس به مدت {toFaDigits((statusData?.quota.cacheTtlSearchSec ?? 600) / 60)} دقیقه و نتایج ترافیک لحظه‌ای به مدت {toFaDigits(statusData?.quota.cacheTtlRoutingSec ?? 60)} ثانیه کش می‌شوند تا سهمیه کلید نشان بهینه مصرف شود.
              </p>
            </Surface>

            <Surface className="space-y-2 p-4">
              <p className="inline-flex items-center gap-1.5 text-xs font-bold text-warn">
                <Building2 className="h-4 w-4" aria-hidden />
                پالیسی انتخاب ابزارها (۱۱ از ۱۹ ابزار)
              </p>
              <p className="text-sm font-extrabold text-ink">
                {toFaDigits(statusData?.activeToolsCount ?? 11)} ابزار فعال · ۸ ابزار غیرفعال/ادغام‌شده
              </p>
              <p className="text-xs leading-6 text-muted">
                ابزارهای ضروری مکان‌یابی، مسیریابی، ایزوکرون و TSP فعال‌اند و ابزارهای سازمانی سنگین (مثل `neshan_vrp_logistic` یا `neshan_map_matching`) برای حفظ دقت LLM و سهمیه غیرفعال شده‌اند.
              </p>
            </Surface>
          </div>

          <Section
            title="فهرست کامل ۱۹ ابزار سرور MCP نشان و وضعیت فعال‌سازی در دارینو"
            description="بررسی فنی تک‌تک ابزارهای سرور رسمی نشان و علت فعال یا غیرفعال بودن هر ابزار در معماری Serverless دارینو."
            action={
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['all', 'همه (۱۹)'],
                    ['active_core', 'فعال ضروری (۹)'],
                    ['active_conditional', 'فعال مشروط (۲)'],
                    ['disabled_serverless', 'غیرفعال / ادغام‌شده (۸)']
                  ] as const
                ).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setToolPolicyFilter(val)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-2xs font-semibold transition',
                      toolPolicyFilter === val
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-divider bg-card text-muted hover:text-ink'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            }
          >
            <Surface className="overflow-x-auto p-3">
              <table className="w-full border-separate border-spacing-0 text-xs">
                <thead>
                  <tr className="text-muted">
                    <th className="border-b border-divider px-2.5 py-2 text-start font-semibold">نام ابزار MCP</th>
                    <th className="border-b border-divider px-2.5 py-2 text-start font-semibold">کاربرد در دارینو</th>
                    <th className="border-b border-divider px-2.5 py-2 text-start font-semibold">وضعیت فعال‌سازی</th>
                    <th className="border-b border-divider px-2.5 py-2 text-start font-semibold">هزینه/سهمیه</th>
                    <th className="border-b border-divider px-2.5 py-2 text-start font-semibold">علت فنی در معماری دارینو</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTools.map((tool) => (
                    <tr key={tool.name}>
                      <td className="num-ltr border-b border-divider px-2.5 py-2.5 font-mono text-2xs font-bold text-ink">
                        {tool.name}
                      </td>
                      <td className="border-b border-divider px-2.5 py-2.5 font-semibold text-ink">
                        {tool.titleFa}
                        <span className="block text-2xs font-normal text-subtle">{tool.categoryFa}</span>
                      </td>
                      <td className="border-b border-divider px-2.5 py-2.5">
                        <Badge
                          tone={
                            tool.policy === 'active_core'
                              ? 'gain'
                              : tool.policy === 'active_conditional'
                                ? 'info'
                                : 'neutral'
                          }
                        >
                          {tool.policyLabelFa}
                        </Badge>
                      </td>
                      <td className="border-b border-divider px-2.5 py-2.5 text-muted">
                        {tool.costNoteFa}
                      </td>
                      <td className="border-b border-divider px-2.5 py-2.5 leading-6 text-muted">
                        {tool.policyReasonFa}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Surface>
          </Section>

          <Disclosure summary="راهنمای تنظیم کلید NESHAN_API_KEY در محیط محلی و Vercel">
            <div className="space-y-2 pt-2 text-xs leading-6 text-muted">
              <p>
                ۱. وارد پنل توسعه‌دهندگان نشان در{' '}
                <a href={NESHAN_PLATFORM_MCP_URL} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                  platform.neshan.org/mcp
                </a>{' '}
                شوید و کلید API با دسترسی سرویس MCP دریافت کنید (یا طبق راهنمای{' '}
                <a href={MCPFARSI_NESHAN_URL} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                  mcpfarsi.ir/servers/neshan
                </a>{' '}
                تیکت فعال‌سازی MCP ثبت نمایید).
              </p>
              <p>
                ۲. در فایل <code>.env</code> محلی یا در بخش Environment Variables داشبورد Vercel، متغیر{' '}
                <code>NESHAN_API_KEY</code> را قرار دهید. کلید هرگز نباید پیشوند <code>VITE_</code> داشته باشد.
              </p>
              <p>
                ۳. سرور دارینو به‌صورت خودکار ابتدا پروتکل رسمی MCP نشان و در صورت نیاز وب‌سرویس‌های استاندارد نشان را با همان کلید فراخوانی می‌کند.
              </p>
            </div>
          </Disclosure>
        </div>
      )}
    </Page>
  );
}
