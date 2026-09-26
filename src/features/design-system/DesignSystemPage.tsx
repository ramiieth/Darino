/**
 * Darino Design System — the canonical, living reference.
 * Every example on this page is the real production component, not a mockup.
 */
import { useState, type ReactNode } from 'react';
import { ArrowLeftRight, Download, Plus, RefreshCw, Star, Trash2, Wallet } from 'lucide-react';
import { PageHeader, Page } from '@/shared/components/layout/Page';
import { Section, Surface } from '@/shared/components/ui/GlassCard';
import { Button, IconButton } from '@/shared/components/ui/Button';
import { Field, Input, SearchField, Select } from '@/shared/components/ui/Input';
import { ChipGroup, SegmentedControl, Tabs } from '@/shared/components/ui/SegmentedControl';
import { Badge, StatusDot } from '@/shared/components/ui/Badge';
import { ProvenanceBadge } from '@/shared/components/ui/ProvenanceBadge';
import {
  DeltaValue,
  KeyValueList,
  Metric,
  MetricGrid,
  MoneyValue,
  PercentValue,
  QuantityValue
} from '@/shared/components/ui/FinancialValue';
import { EmptyState, ErrorState, Notice, OfflineState, ListSkeleton } from '@/shared/components/ui/StateViews';
import { ListRow } from '@/shared/components/ui/ListRow';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Dialog, Sheet } from '@/shared/components/ui/Sheet';
import { FreshnessBar } from '@/shared/components/ui/FreshnessBar';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { cn } from '@/shared/lib/cn';

const TOC = [
  { id: 'colors', label: 'رنگ' },
  { id: 'type', label: 'تایپوگرافی' },
  { id: 'space', label: 'فاصله، شعاع، ارتفاع' },
  { id: 'motion', label: 'حرکت و آیکون' },
  { id: 'buttons', label: 'دکمه‌ها' },
  { id: 'controls', label: 'کنترل‌ها' },
  { id: 'finance', label: 'اعداد مالی' },
  { id: 'states', label: 'وضعیت‌ها' },
  { id: 'data', label: 'جدول و فهرست' },
  { id: 'overlays', label: 'شیت و دیالوگ' },
  { id: 'content', label: 'محتوا' },
  { id: 'responsive', label: 'واکنش‌گرایی و PWA' }
];

const COLORS: { group: string; items: { name: string; token: string; hex: string; use: string; className: string }[] }[] = [
  {
    group: 'برند',
    items: [
      { name: 'brand-50', token: 'bg-brand-50', hex: '#EEF3FF', use: 'پس‌زمینه وضعیت انتخاب‌شده', className: 'bg-brand-50' },
      { name: 'brand-100', token: 'bg-brand-100', hex: '#DCE6FF', use: 'حالت hover روی soft', className: 'bg-brand-100' },
      { name: 'brand-500', token: 'accent', hex: '#2E5BFF', use: 'اقدام اصلی، لینک، فوکوس، وضعیت فعال · ۵٫۲:۱', className: 'bg-brand-500' },
      { name: 'brand-600', token: 'accent-strong', hex: '#1F47E0', use: 'hover دکمه اصلی', className: 'bg-brand-600' },
      { name: 'brand-700', token: 'brand-700', hex: '#1837B0', use: 'pressed', className: 'bg-brand-700' },
      { name: 'brand-900', token: 'brand-900', hex: '#0B1B5C', use: 'سطوح تیره تأکیدی', className: 'bg-brand-900' }
    ]
  },
  {
    group: 'متن',
    items: [
      { name: 'ink', token: 'text-ink', hex: '#0E1530', use: 'محتوای اصلی · ۱۷:۱', className: 'bg-ink' },
      { name: 'ink-muted', token: 'text-muted', hex: '#5B6480', use: 'توضیح پشتیبان · ۵٫۹:۱', className: 'bg-muted' },
      { name: 'ink-subtle', token: 'text-subtle', hex: '#8A92AB', use: 'فقط متادیتای غیرضروری/placeholder · ۳٫۱:۱', className: 'bg-subtle' }
    ]
  },
  {
    group: 'سطح',
    items: [
      { name: 'white', token: 'bg-card', hex: '#FFFFFF', use: 'سطح اصلی', className: 'bg-card' },
      { name: 'canvas', token: 'bg-canvas', hex: '#F6F8FC', use: 'پس‌زمینه برنامه', className: 'bg-canvas' },
      { name: 'surface-2', token: 'bg-surface-2', hex: '#EFF2F8', use: 'فیلد، ته‌رنگ خنثی (افزوده)', className: 'bg-surface-2' },
      { name: 'line', token: 'border-divider', hex: '#E6E9F2', use: 'جداکننده', className: 'bg-divider' },
      { name: 'line-strong', token: 'border-divider-strong', hex: '#D5DAE7', use: 'مرز کنترل‌ها (افزوده)', className: 'bg-divider-strong' }
    ]
  },
  {
    group: 'معنای مالی',
    items: [
      { name: 'gain', token: 'bg-gain', hex: '#0F9D6B', use: 'سود — نمودار و اعداد بزرگ', className: 'bg-gain' },
      { name: 'gain-text', token: 'text-positive', hex: '#0B7F57', use: 'سود — متن کوچک · ۵٫۰:۱ (افزوده)', className: 'bg-positive' },
      { name: 'loss', token: 'text-negative', hex: '#C8293F', use: 'زیان · ۵٫۵:۱ (افزوده)', className: 'bg-negative' },
      { name: 'gold', token: 'bg-gold', hex: '#B7861F', use: 'فقط مفاهیم طلا / لیست پیگیری', className: 'bg-gold' },
      { name: 'gold-text', token: 'text-gold-text', hex: '#8F6812', use: 'متن طلا · ۵٫۰:۱ (افزوده)', className: 'bg-gold-text' },
      { name: 'warn', token: 'text-warn', hex: '#B45309', use: 'داده قدیمی، احتیاط', className: 'bg-warn' }
    ]
  }
];

const TYPE: { role: string; spec: string; cls: string; sample: ReactNode }[] = [
  { role: 'Display', spec: '48 / 62 · ExtraBold', cls: 'text-5xl font-extrabold tracking-tight', sample: 'دارینو' },
  { role: 'Headline (H1)', spec: '30 / 40 · ExtraBold (موبایل 24)', cls: 'text-3xl font-extrabold tracking-tight', sample: 'داشبورد' },
  { role: 'Financial hero', spec: '36–48 · ExtraBold · LTR', cls: 'text-4xl font-extrabold tracking-tight', sample: <MoneyValue value={32094.66} /> },
  { role: 'Figure', spec: '24 / 32 · ExtraBold · LTR', cls: 'text-2xl font-extrabold', sample: <MoneyValue value={8967.19} /> },
  { role: 'Title (H3)', spec: '18 / 28 · Bold', cls: 'text-lg font-bold', sample: 'بهترین فرصت‌ها' },
  { role: 'Section', spec: '16 / 28 · Bold', cls: 'text-base font-bold', sample: 'دارایی‌ها' },
  { role: 'Body large', spec: '18 / 32 · Regular', cls: 'text-lg', sample: 'متن توضیحی بلند با خوانایی بالا.' },
  { role: 'Body', spec: '16 / 28 · Regular', cls: 'text-base', sample: 'متن اصلی رابط کاربری.' },
  { role: 'Label / Body-sm', spec: '14 / 22 · SemiBold/Regular', cls: 'text-sm font-semibold', sample: 'موجودی نقد' },
  { role: 'Caption', spec: '12 / 20 · Regular', cls: 'text-xs text-muted', sample: 'به‌روزرسانی ۲ دقیقه پیش' },
  { role: 'Micro (کف)', spec: '11 / 16 · SemiBold', cls: 'text-2xs font-semibold text-muted', sample: 'ETH · نشان و سرستون فشرده' }
];

function Swatch({ c }: { c: (typeof COLORS)[number]['items'][number] }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className={cn('h-10 w-10 shrink-0 rounded-field ring-1 ring-divider', c.className)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">
          {c.name} <bdi dir="ltr" className="ms-1 font-mono text-xs font-normal text-muted">{c.hex}</bdi>
        </p>
        <p className="text-xs text-muted">{c.use}</p>
      </div>
      <bdi dir="ltr" className="hidden shrink-0 font-mono text-2xs text-subtle sm:block">{c.token}</bdi>
    </li>
  );
}

function Demo({ title, children, note }: { title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-bold text-ink">{title}</h3>
      {children}
      {note && <p className="mt-2 text-xs leading-5 text-muted">{note}</p>}
    </div>
  );
}

export default function DesignSystemPage() {
  const [tab, setTab] = useState<'a' | 'b' | 'c'>('a');
  const [seg, setSeg] = useState<'1d' | '7d' | '30d'>('7d');
  const [chip, setChip] = useState<'all' | 'crypto' | 'stock'>('all');
  const [q, setQ] = useState('');
  const [sheet, setSheet] = useState<null | 'auto' | 'panel' | 'dialog'>(null);

  return (
    <Page>
      <PageHeader
        eyebrow="Darino Design System · v2"
        title="سیستم طراحی دارینو"
        subtitle="منبع حقیقت بصری دارینو — بنیان‌ها، اجزا، الگوها و قواعد محتوا. هر نمونه در این صفحه همان کامپوننت واقعی محصول است."
      />

      <nav aria-label="فهرست" className="-mx-gutter flex gap-1.5 overflow-x-auto px-gutter no-scrollbar md:mx-0 md:flex-wrap md:px-0">
        {TOC.map((t) => (
          <a
            key={t.id}
            href={`#/design-system`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="flex h-8 shrink-0 items-center rounded-control border border-divider-strong bg-card px-3 text-xs font-semibold text-muted hover:text-ink"
          >
            {t.label}
          </a>
        ))}
      </nav>

      <Notice tone="info" title="اصول">
        محتوا مقدم بر تزئین · وضوح مقدم بر افکت · سلسله‌مراتب با فاصله و تایپوگرافی، نه کارت‌های تو‌در‌تو · رنگ برند فقط برای
        اقدام، فوکوس و وضعیت فعال · سبز فقط برای سود، طلایی فقط برای طلا · هیچ عدد مالی جعل نمی‌شود.
      </Notice>

      {/* ================= FOUNDATIONS ================= */}
      <Section id="colors" title="رنگ" description="توکن‌های مرجع + افزوده‌های مستند (برای کنتراست WCAG AA و حالت تیره)">
        <div className="grid gap-6 lg:grid-cols-2">
          {COLORS.map((g) => (
            <Surface key={g.group} className="px-4 md:px-5">
              <h3 className="pt-4 text-sm font-bold text-ink">{g.group}</h3>
              <ul className="divide-y divide-divider">
                {g.items.map((c) => (
                  <Swatch key={c.name} c={c} />
                ))}
              </ul>
            </Surface>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-muted">
          نمودارها از پالت دسته‌ای chart-1…6 (آبی برند → سرمه‌ای → آبی روشن → خاکستری) استفاده می‌کنند؛ سبز/قرمز فقط برای داده‌های
          علامت‌دار. همه رنگ‌ها در حالت تیره نسخه متناظر دارند.
        </p>
      </Section>

      <Section id="type" title="تایپوگرافی" description="Vazirmatn · وزن‌های 400 / 600 / 700 / 800 · اعداد مالی LTR و tabular">
        <Surface className="divide-y divide-divider px-4 md:px-6">
          {TYPE.map((t) => (
            <div key={t.role} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4">
              <div className="w-40 shrink-0">
                <p className="text-sm font-semibold text-ink">{t.role}</p>
                <p className="text-xs text-muted">{t.spec}</p>
              </div>
              <div className={cn('min-w-0 max-w-full flex-1 overflow-hidden text-ink', t.cls)}>{t.sample}</div>
            </div>
          ))}
        </Surface>
      </Section>

      <Section id="space" title="فاصله، شعاع و ارتفاع" description="شبکه ۴px · حاشیه صفحه ۲۰px · گروه‌ها ۲۴/۳۲px · کنترل‌ها ۸/۱۲px">
        <div className="grid gap-6 lg:grid-cols-3">
          <Surface className="p-4 md:p-5">
            <h3 className="mb-3 text-sm font-bold text-ink">فاصله</h3>
            <ul className="space-y-2">
              {[4, 8, 12, 16, 20, 24, 32, 48, 64].map((v) => (
                <li key={v} className="flex items-center gap-3 text-xs text-muted">
                  <span className="num-ltr w-8">{v}</span>
                  <span className="h-2 rounded-sm bg-chart-1" style={{ width: v * 2 }} />
                </li>
              ))}
            </ul>
          </Surface>
          <Surface className="p-4 md:p-5">
            <h3 className="mb-3 text-sm font-bold text-ink">شعاع</h3>
            <ul className="grid grid-cols-2 gap-3">
              {[
                ['8 · control', 'rounded-control', 'تب، چیپ، نشان'],
                ['12 · field', 'rounded-field', 'دکمه، ورودی'],
                ['16 · card', 'rounded-card', 'سطح‌ها، نتایج'],
                ['24 · panel', 'rounded-panel', 'شیت، دیالوگ']
              ].map(([l, c, u]) => (
                <li key={l} className="text-center">
                  <div className={cn('mx-auto h-14 w-full border border-divider-strong bg-surface-2', c)} />
                  <p className="num-ltr mt-1 text-xs font-semibold text-ink">{l}</p>
                  <p className="text-2xs text-muted">{u}</p>
                </li>
              ))}
            </ul>
          </Surface>
          <Surface className="p-4 md:p-5">
            <h3 className="mb-3 text-sm font-bold text-ink">ارتفاع (فقط سه سطح)</h3>
            <div className="space-y-4">
              <div className="rounded-card border border-divider bg-card p-3 text-xs text-muted">raised — مرز نازک، بدون سایه</div>
              <div className="rounded-card border border-divider bg-card p-3 text-xs text-muted shadow-card">focal — یک عنصر کانونی در هر نما</div>
              <div className="rounded-card bg-card p-3 text-xs text-muted shadow-pop">pop — شیت، منو، پالت فرمان</div>
            </div>
          </Surface>
        </div>
      </Section>

      <Section id="motion" title="حرکت و آیکون">
        <div className="grid gap-6 lg:grid-cols-2">
          <Surface className="px-4 md:px-5">
            <KeyValueList
              rows={[
                { label: 'fast · 120ms', value: 'hover، تغییر رنگ' },
                { label: 'base · 200ms', value: 'دیالوگ، پاپ‌اور، تغییر وضعیت' },
                { label: 'slow · 280ms', value: 'ورود شیت و پنل' },
                { label: 'easing', value: <bdi dir="ltr" className="font-mono text-xs">cubic-bezier(0.2, 0, 0, 1)</bdi> },
                { label: 'prefers-reduced-motion', value: 'همه انیمیشن‌ها حذف؛ رابط همچنان سریع' }
              ]}
            />
          </Surface>
          <Surface className="p-4 md:p-5">
            <p className="mb-3 text-sm text-muted">Lucide · stroke 2 · ۱۶px در کنترل‌ها، ۲۰px در ناوبری · آیکون فقط همراه برچسب یا aria-label.</p>
            <div className="flex flex-wrap items-center gap-4 text-ink">
              {[Wallet, ArrowLeftRight, Download, RefreshCw, Star, Plus].map((I, i) => (
                <I key={i} aria-hidden className="h-5 w-5" />
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">
              جهت‌دار: شِورون «ورود به جزئیات» به سمت انتهای خط (چپ در RTL) · فلش‌های روند و محور زمان نمودارها آینه نمی‌شوند.
            </p>
          </Surface>
        </div>
      </Section>

      {/* ================= COMPONENTS ================= */}
      <Section id="buttons" title="دکمه‌ها" description="در هر نما حداکثر یک دکمه اصلی">
        <Surface className="space-y-6 p-4 md:p-6">
          <Demo title="گونه‌ها">
            <div className="flex flex-wrap items-center gap-2">
              <Button>اصلی</Button>
              <Button variant="secondary">ثانویه</Button>
              <Button variant="outline">حاشیه‌دار</Button>
              <Button variant="ghost">کم‌رنگ</Button>
              <Button variant="destructive" icon={<Trash2 />}>
                حذف/معکوس
              </Button>
              <Button variant="link">پیوند متنی</Button>
              <span className="rounded-field bg-ink p-2">
                <Button variant="inverse" size="sm">
                  معکوس
                </Button>
              </span>
            </div>
          </Demo>
          <Demo title="اندازه و وضعیت" note="ارتفاع ۳۲ / ۴۰ / ۴۸ — در دستگاه‌های لمسی ۴px بلندتر (هدف لمسی ≥ ۴۴px).">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm">کوچک</Button>
              <Button>متوسط</Button>
              <Button size="lg">بزرگ</Button>
              <Button loading>در حال ثبت</Button>
              <Button disabled>غیرفعال</Button>
              <IconButton aria-label="تازه‌سازی">
                <RefreshCw />
              </IconButton>
              <IconButton aria-label="افزودن" variant="outline">
                <Plus />
              </IconButton>
            </div>
          </Demo>
        </Surface>
      </Section>

      <Section id="controls" title="کنترل‌ها" description="ارتفاع، شعاع، حلقه فوکوس و اعتبارسنجی یکسان">
        <Surface className="grid gap-6 p-4 md:grid-cols-2 md:p-6">
          <Field label="مبلغ" hint="اعداد LTR، واحد در انتهای فیلد">
            <Input dir="ltr" inputMode="decimal" placeholder="0.00" suffix="$" />
          </Field>
          <Field label="مبلغ برداشت" error="مبلغ از موجودی نقد بیشتر است">
            <Input dir="ltr" defaultValue="99999" suffix="$" />
          </Field>
          <Field label="زنجیره">
            <Select defaultValue="1">
              <option value="1">اتریوم</option>
              <option value="2">آربیتروم</option>
            </Select>
          </Field>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted">جستجو</p>
            <SearchField value={q} onChange={setQ} placeholder="جستجوی نماد یا نام…" />
          </div>
          <Demo title="Tabs — بخش‌های یک صفحه">
            <Tabs value={tab} onChange={setTab} options={[{ value: 'a', label: 'ثبت تراکنش' }, { value: 'b', label: 'دفتر روزنامه', badge: 12 }, { value: 'c', label: 'ممیزی' }]} />
          </Demo>
          <Demo title="SegmentedControl — پارامتر نما">
            <SegmentedControl value={seg} onChange={setSeg} options={[{ value: '1d', label: '۱ روز' }, { value: '7d', label: '۷ روز' }, { value: '30d', label: '۳۰ روز' }]} />
          </Demo>
          <Demo title="ChipGroup — فیلتر">
            <ChipGroup value={chip} onChange={setChip} options={[{ value: 'all', label: 'همه', badge: 158 }, { value: 'crypto', label: 'رمزارز' }, { value: 'stock', label: 'سهام' }]} />
          </Demo>
          <Demo title="نشان‌ها و وضعیت">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">خنثی</Badge>
              <Badge tone="brand">برند</Badge>
              <Badge tone="gain">فرصت بالقوه</Badge>
              <Badge tone="loss">ناهنجاری</Badge>
              <Badge tone="warn">ذخیره‌شده</Badge>
              <Badge tone="gold">طلا</Badge>
              <ProvenanceBadge kind="live" />
              <ProvenanceBadge kind="simulated" />
              <StatusDot tone="gain" label="زنده" />
              <StatusDot tone="warn" label="قدیمی" />
            </div>
          </Demo>
        </Surface>
      </Section>

      <Section id="finance" title="اعداد مالی" description="یک قاعده برای همه اعداد: LTR، tabular، علامت پیش از ارز، هرگز صفرِ جعلی">
        <div className="grid gap-6 lg:grid-cols-2">
          <Surface className="px-4 md:px-5">
            <KeyValueList
              rows={[
                { label: 'مبلغ', value: <MoneyValue value={23126} /> },
                { label: 'سود/زیان (علامت‌دار)', value: <MoneyValue value={-423.41} signed tone="auto" /> },
                { label: 'قیمت زیر یک دلار', value: <MoneyValue value={0.000004712} /> },
                { label: 'فشرده', value: <MoneyValue value={1_290_000_000_000} compact /> },
                { label: 'درصد تغییر', value: <PercentValue value={2.41} /> },
                { label: 'نرخ بدون علامت (APY)', value: <PercentValue value={11.22} signed={false} tone="none" /> },
                { label: 'تغییر با پیکان', value: <DeltaValue pct={-1.2} usd={-21.42} period="۲۴ ساعت" /> },
                { label: 'مقدار', value: <QuantityValue value={3.33} unit="ETH" /> }
              ]}
            />
          </Surface>
          <Surface className="px-4 md:px-5">
            <KeyValueList
              rows={[
                { label: 'در حال بارگذاری', value: <MoneyValue value={null} state="loading" /> },
                { label: 'داده قدیمی (کش)', value: <MoneyValue value={2692.96} state="stale" /> },
                { label: 'نامشخص (نه صفر)', value: <MoneyValue value={null} /> },
                { label: 'صفر واقعی', value: <MoneyValue value={0} /> }
              ]}
            />
            <div className="border-t border-divider py-4">
              <MetricGrid cols={2}>
                <Metric size="lg" label="ارزش خالص" value={<MoneyValue value={32094.66} />} sub="≈ ۴٫۷۵ میلیارد تومان" />
                <Metric size="lg" label="سود/زیان باز" value={<MoneyValue value={-423.41} signed tone="auto" />} sub={<PercentValue value={-4.49} />} />
              </MetricGrid>
            </div>
          </Surface>
        </div>
      </Section>

      <Section id="states" title="وضعیت‌ها" description="بارگذاری · خالی · خطا · آفلاین · قدیمی · ناقص — آرام و قابل اقدام">
        <div className="grid gap-4 lg:grid-cols-2">
          <Notice tone="stale" title="داده ذخیره‌شده">ارتباط زنده برقرار نیست؛ آخرین داده ذخیره‌شده نمایش داده می‌شود.</Notice>
          <Notice tone="warn">قیمت ONDO در دسترس نیست — ارزش کل بدون آن محاسبه شده است (ناقص).</Notice>
          <Notice tone="success">Snapshot ثبت شد.</Notice>
          <Notice tone="neutral">بازده گذشته تضمینی برای آینده نیست.</Notice>
          <FreshnessBar loadedAt={Date.now() - 120_000} sourceLabel="CoinGecko" autoMs={120_000} onRefresh={() => undefined} className="lg:col-span-2" />
          <EmptyState message="هنوز دارایی‌ای ثبت نشده است" hint="با ثبت واریز یا خرید، دارایی‌ها اینجا نمایش داده می‌شوند." />
          <ErrorState message="اتصال به منبع داده برقرار نشد" onRetry={() => undefined} />
          <OfflineState onRetry={() => undefined} />
          <Surface className="px-4">
            <ListSkeleton rows={3} />
          </Surface>
        </div>
      </Section>

      <Section id="data" title="جدول و فهرست" description="دسکتاپ: جدول مرتب‌پذیر با سرستون چسبان · موبایل: ردیف فهرست، بدون اسکرول افقی">
        <div className="grid gap-6 lg:grid-cols-2">
          <Surface className="overflow-hidden">
            <table className="data-table">
              <caption className="sr-only">نمونه جدول مالی</caption>
              <thead>
                <tr>
                  <th scope="col" className="!ps-5">دارایی</th>
                  <th scope="col" className="col-num">قیمت</th>
                  <th scope="col" className="col-num !pe-5">۲۴ ساعت</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['BTC', 'بیت‌کوین', 58690, 1.24],
                  ['ETH', 'اتریوم', 2692.96, -0.83],
                  ['SOL', 'سولانا', 73.37, 0]
                ].map(([s, n, p, c]) => (
                  <tr key={s as string}>
                    <td className="!ps-5">
                      <span className="flex items-center gap-3">
                        <AssetLogo symbol={s as string} kind="crypto" size={28} />
                        <span className="font-semibold text-ink">{n}</span>
                      </span>
                    </td>
                    <td className="col-num"><MoneyValue value={p as number} /></td>
                    <td className="col-num !pe-5"><PercentValue value={c as number} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Surface>
          <Surface className="px-4">
            <ListRow
              onClick={() => undefined}
              leading={<AssetLogo symbol="ETH" kind="crypto" size={36} />}
              title="اتریوم"
              subtitle="3.33 ETH · میانگین $2,820.00"
              trailing={<MoneyValue value={8967.19} />}
              trailingSub={<MoneyValue value={-423.41} signed tone="auto" />}
            />
            <div className="border-t border-divider">
              <Disclosure summary="جزئیات (افشای تدریجی)">
                <p className="text-sm text-muted">جزئیات ثانویه پشت افشا قرار می‌گیرد تا نمای اصلی ساده بماند.</p>
              </Disclosure>
            </div>
          </Surface>
        </div>
      </Section>

      <Section id="overlays" title="شیت، پنل و دیالوگ" description="قاعده انتخاب الگو بر اساس نوع کار">
        <Surface className="p-4 md:p-6">
          <KeyValueList
            rows={[
              { label: 'Dialog', value: 'تأیید متمرکز و کوتاه (ثبت معکوس، تأیید برداشت)' },
              { label: 'Sheet (auto)', value: 'اطلاعات زمینه‌ای — پایین‌برگه در موبایل، دیالوگ در دسکتاپ' },
              { label: 'Panel', value: 'جریان کاری ثانویه/جزئیات — پنل کناری در دسکتاپ' },
              { label: 'صفحه کامل', value: 'کار پیچیده (ماشین‌حساب، جزئیات بازار)' }
            ]}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setSheet('auto')}>Sheet</Button>
            <Button variant="outline" onClick={() => setSheet('panel')}>Panel</Button>
            <Button variant="outline" onClick={() => setSheet('dialog')}>Dialog</Button>
          </div>
          <p className="mt-3 text-xs text-muted">همه: ESC، تله فوکوس، بازگرداندن فوکوس، قفل اسکرول، ناحیه امن و کشیدن برای بستن در موبایل.</p>
        </Surface>
        <Sheet open={sheet === 'auto' || sheet === 'panel'} onClose={() => setSheet(null)} title="نمونه" description="محتوای زمینه‌ای" variant={sheet === 'panel' ? 'panel' : 'auto'}>
          <p className="text-sm leading-7 text-muted">این همان کامپوننت Sheet محصول است.</p>
        </Sheet>
        <Dialog
          open={sheet === 'dialog'}
          onClose={() => setSheet(null)}
          title="ثبت سند معکوس؟"
          footer={
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setSheet(null)}>انصراف</Button>
              <Button variant="destructive" className="flex-1" onClick={() => setSheet(null)}>ثبت معکوس</Button>
            </div>
          }
        >
          <p className="text-sm text-muted">یک سند جدید با طرف‌های قرینه ثبت می‌شود.</p>
        </Dialog>
      </Section>

      {/* ================= CONTENT ================= */}
      <Section id="content" title="قواعد محتوا">
        <Surface className="px-4 md:px-6">
          <KeyValueList
            rows={[
              { label: 'لحن', value: 'عنوان‌ها صمیمی، توضیحات دقیق و حرفه‌ای؛ واژه‌های مالی بدون اغراق' },
              { label: 'اعداد مالی', value: 'ارقام لاتین، LTR، جداکننده هزارگان، دو رقم اعشار برای مبالغ' },
              { label: 'تومان', value: 'ارقام فارسی (سیاست مشتری) — «≈ ۴٫۷۵ میلیارد تومان»' },
              { label: 'درصد', value: '+2.41% / -1.20% — علامت صریح برای تغییر؛ APY بدون علامت' },
              { label: 'ارز', value: '$ پیش از عدد؛ منفی: -$12.50' },
              { label: 'تاریخ', value: 'شمسی به‌صورت پیش‌فرض، میلادی در صورت نیاز کنار آن' },
              { label: 'نیم‌فاصله', value: 'دارایی‌ها، پیش‌نمایش، تحقق‌یافته — همیشه با ZWNJ' },
              { label: 'سلب مسئولیت', value: 'بازده گذشته یا اعلام‌شده تضمینی برای آینده نیست؛ شبیه‌سازی‌ها فرضی‌اند' },
              { label: 'نامشخص', value: '«—» با برچسب دسترس‌پذیر «نامشخص»؛ هرگز ۰' }
            ]}
          />
        </Surface>
      </Section>

      <Section id="responsive" title="واکنش‌گرایی و PWA">
        <div className="grid gap-6 lg:grid-cols-2">
          <Surface className="overflow-hidden">
            <table className="data-table">
              <caption className="sr-only">نقاط شکست</caption>
              <thead>
                <tr>
                  <th scope="col" className="!ps-5">عرض</th>
                  <th scope="col" className="!pe-5">چیدمان</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['< 768', 'نوار بالا + ناوبری پایین (۴ + بیشتر)، فهرست به‌جای جدول، شیت پایین'],
                  ['768 – 1023', 'ریل ناوبری عمودی، جدول‌ها از md، دیالوگ مرکزی'],
                  ['1024 – 1727', 'نوار کناری (جمع‌شونده)، چیدمان ۱۲ ستونی، پنل کناری'],
                  ['≥ 1728', 'عرض محتوا تا ۱۴۴۰px']
                ].map(([w, l]) => (
                  <tr key={w}>
                    <td className="num-ltr !ps-5 font-semibold text-ink">{w}</td>
                    <td className="!pe-5 !whitespace-normal text-muted">{l}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Surface>
          <Surface className="px-4 md:px-5">
            <KeyValueList
              rows={[
                { label: 'نصب', value: 'دکمه نصب فقط وقتی مرورگر پشتیبانی کند؛ راهنمای iOS در «بیشتر»' },
                { label: 'استندالون', value: 'ناحیه امن بالا/پایین، عنوان فشرده هنگام اسکرول، دکمه بازگشت در جزئیات' },
                { label: 'آفلاین', value: 'نوار سراسری + داده ذخیره‌شده با برچسب «قدیمی»' },
                { label: 'به‌روزرسانی', value: 'اعلان «نسخه جدید» با اقدام بارگذاری مجدد' },
                { label: 'شروع', value: 'اسپلش سبک درون index.html هم‌رنگ تم' }
              ]}
            />
          </Surface>
        </div>
      </Section>
    </Page>
  );
}
