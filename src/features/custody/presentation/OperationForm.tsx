/**
 * فرم ثبت/ویرایش عملیات — فقط ثبت در دفتر؛ هیچ تراکنشی روی زنجیره ارسال نمی‌شود.
 *  • فرم خالی شروع می‌شود (بدون مقدار، آدرس، هش، زمان یا وضعیت ساختگی).
 *  • ذخیره فقط با دکمهٔ «ثبت» — فرم نیمه‌کاره هیچ رکوردی نمی‌سازد.
 *  • پیش‌نمایش اثر روی موجودی‌ها قبل از ذخیره.
 */
import { useMemo, useState } from 'react';
import { ArrowDown, Plus, Trash2 } from 'lucide-react';
import { Sheet } from '@/shared/components/ui/Sheet';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { Notice } from '@/shared/components/ui/StateViews';
import { ChipGroup, SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { toast } from '@/shared/store/toastStore';
import { arcusCollateralAssetId, OTHER_PROVIDER_ID, PLATFORMS } from '../domain/catalog';
import { formatAmount, isZero, parsePositiveAmount, sub } from '../domain/decimal';
import {
  applyEdit,
  availableBalance,
  computeEffects,
  emptyOperation,
  findDuplicates,
  isNegative,
  KIND_META,
  newId,
  OPERATION_KINDS,
  STATUS_LABEL,
  validateOperation,
  VERIFICATION_LABEL
} from '../domain/ledger';
import { checkTrackingUrl, isEvmTxHash } from '../domain/links';
import type { Asset, Fee, FeeKind, FeeTreatment, Holding, Leg, Operation, OperationKind, Verification } from '../domain/types';
import { saveOperation } from '../data/repository';
import { priceAt } from '../data/historicalPrice';
import { fmtDateTime } from '@/shared/utils/formatters';
import type { CustodyData } from '../data/useCustody';
import { AssetChip, AssetLogoFor, assetOptions, DateTimeField, EntityPicker, HoldingChip, holdingOptions, type PickerOption } from './parts';
import { LogoImage } from '@/shared/components/ui/EntityLogo';

const FEE_KIND_LABEL: Record<FeeKind, string> = {
  bridge: 'کارمزد بریج',
  platform: 'کارمزد پلتفرم',
  network: 'کارمزد شبکه',
  bridge_and_platform: 'کارمزد بریج و پلتفرم (تجمیعی)',
  other: 'سایر'
};

const TREATMENT_LABEL: Record<FeeTreatment, string> = {
  included_in_source: 'داخل مقدار خروجی از مبدا است',
  netted_in_received: 'از مقدار دریافتی کم شده (دریافتی خالص است)',
  separate: 'جداگانه از موجودی دیگری پرداخت شده'
};

function legAssetFilter(holding: Holding | undefined): (a: Asset) => boolean {
  if (!holding) return (a) => !a.platformId;
  if (holding.kind === 'arcus' && holding.arcus) {
    const id = arcusCollateralAssetId(holding.arcus.env);
    return (a) => a.id === id;
  }
  if (holding.kind === 'platform') return () => true;
  return (a) => !a.platformId;
}

export function OperationForm({
  d,
  open,
  onClose,
  initial,
  initialKind = 'bridge'
}: {
  d: CustodyData;
  open: boolean;
  onClose: () => void;
  /** ویرایش عملیات موجود */
  initial?: Operation | null;
  initialKind?: OperationKind;
}) {
  const [draft, setDraft] = useState<Operation>(() => initial ?? emptyOperation(initialKind));
  const [direction, setDirection] = useState<'increase' | 'decrease'>(() => (initial && initial.kind === 'balance_adjustment' && initial.from.holdingId ? 'decrease' : 'increase'));
  const [submitted, setSubmitted] = useState(false);
  const [confirmDup, setConfirmDup] = useState(false);
  const [saving, setSaving] = useState(false);
  const isEdit = !!initial;
  const meta = KIND_META[draft.kind];

  const set = (p: Partial<Operation>) => setDraft((o) => ({ ...o, ...p }));
  const setLeg = (side: 'from' | 'to', p: Partial<Leg>) => setDraft((o) => ({ ...o, [side]: { ...o[side], ...p } }));

  const changeKind = (k: OperationKind) => {
    setDraft((o) => ({
      ...o,
      kind: k,
      // سمت‌ها با نوع جدید ممکن است نامعتبر شوند — دارایی‌ها پاک می‌شوند تا انتخاب آگاهانه باشد
      from: { holdingId: null, assetId: null, amount: null },
      to: { holdingId: null, assetId: null, amount: null },
      providerId: KIND_META[k].provider ? o.providerId : null
    }));
    setSubmitted(false);
  };

  /** نسخهٔ نرمال‌شده برای اعتبارسنجی/ذخیره — مقدار نامعتبر همان‌طور می‌ماند تا خطا نمایش داده شود */
  const normalized = useMemo<Operation>(() => {
    const normAmt = (raw: string | null, asset: Asset | undefined) => {
      if (raw === null || raw.trim() === '') return null;
      const r = parsePositiveAmount(raw, asset?.decimals ?? null);
      return r.ok ? r.value : raw;
    };
    const fa = draft.from.assetId ? d.assetById.get(draft.from.assetId) : undefined;
    const ta = draft.to.assetId ? d.assetById.get(draft.to.assetId) : undefined;
    let from = { ...draft.from, amount: normAmt(draft.from.amount, fa) };
    let to = { ...draft.to, amount: normAmt(draft.to.amount, ta) };
    if (draft.kind === 'balance_adjustment') {
      if (direction === 'increase') from = { holdingId: null, assetId: null, amount: null };
      else to = { holdingId: null, assetId: null, amount: null };
    }
    return {
      ...draft,
      from,
      to,
      providerRef: draft.providerRef?.trim() || null,
      sourceTxHash: draft.sourceTxHash?.trim() || null,
      destTxHash: draft.destTxHash?.trim() || null,
      trackingUrl: draft.trackingUrl?.trim() || null,
      note: draft.note?.trim() ? draft.note : null,
      fees: draft.fees.map((f) => ({
        ...f,
        amount: normAmt(f.amount, f.assetId ? d.assetById.get(f.assetId) : undefined),
        usdValue: f.usdValue ? normAmt(f.usdValue, undefined) : null
      })),
      valuation: draft.valuation && draft.valuation.usdValue.trim() !== '' ? { ...draft.valuation, usdValue: normAmt(draft.valuation.usdValue, undefined) ?? '' } : null
    };
  }, [draft, direction, d.assetById]);

  const validation = useMemo(() => validateOperation(normalized, d.ctx), [normalized, d.ctx]);
  const errors = { ...validation.errors };
  if (normalized.trackingUrl) {
    const t = checkTrackingUrl(normalized.trackingUrl, d.networks);
    if (!t.ok) errors.trackingUrl = t.reason;
  }
  if (normalized.sourceTxHash && !isEvmTxHash(normalized.sourceTxHash)) errors.sourceTxHash = 'هش تراکنش باید 0x و ۶۴ رقم هگز باشد';
  if (normalized.destTxHash && !isEvmTxHash(normalized.destTxHash)) errors.destTxHash = 'هش تراکنش باید 0x و ۶۴ رقم هگز باشد';
  if (normalized.providerId === OTHER_PROVIDER_ID && !normalized.providerName?.trim()) errors.providerName = 'نام ارائه‌دهنده را وارد کنید';
  if (normalized.valuation && !/^\d+(\.\d+)?$/.test(normalized.valuation.usdValue)) errors.valuation = 'ارزش دلاری باید عدد مثبت باشد';
  normalized.fees.forEach((f, i) => {
    if (f.usdValue && !/^\d+(\.\d+)?$/.test(f.usdValue)) errors[`fees.${i}.usdValue`] = 'ارزش دلاری باید عدد مثبت باشد';
  });
  const needsValuation = draft.kind === 'swap' || draft.kind === 'bridge_swap' || (draft.kind === 'balance_adjustment' && draft.ledgerPosting === 'opening');

  const dups = useMemo(() => findDuplicates(normalized, d.operations, d.ctx), [normalized, d.operations, d.ctx]);
  const blockingDup = dups.find((h) => h.key.strength === 'blocking');
  const warnDup = dups.filter((h) => h.key.strength === 'warning');

  const effects = useMemo(() => computeEffects(normalized), [normalized]);

  // بررسی موجودی مبدا — فقط هشدار (ثبت تاریخی مجاز است)
  const balanceWarnings: string[] = [];
  for (const e of effects) {
    if (e.role === 'in_transit' || !e.delta.startsWith('-')) continue;
    const before = availableBalance(d.operations, e.holdingId, e.assetId, isEdit ? draft.id : undefined);
    const after = sub(before, e.delta.slice(1));
    if (isNegative(after)) {
      const a = d.assetById.get(e.assetId);
      balanceWarnings.push(
        `موجودی ثبت‌شدهٔ ${a?.name ?? ''} در «${d.holdingById.get(e.holdingId)?.label ?? ''}» (${formatAmount(before)}) کمتر از این خروج است. اگر عملیات تاریخی است یا موجودی اولیه هنوز ثبت نشده، می‌توانید ادامه دهید.`
      );
    }
  }

  const fromHolding = draft.from.holdingId ? d.holdingById.get(draft.from.holdingId) : undefined;
  const toHolding = draft.to.holdingId ? d.holdingById.get(draft.to.holdingId) : undefined;
  const fromAsset = draft.from.assetId ? d.assetById.get(draft.from.assetId) : undefined;
  const toAsset = draft.to.assetId ? d.assetById.get(draft.to.assetId) : undefined;

  const toAssetFilter = (a: Asset) => {
    if (!legAssetFilter(toHolding)(a)) return false;
    if (!fromAsset || a.platformId || fromAsset.platformId) return true;
    if (meta.network === 'same' && a.networkId !== fromAsset.networkId) return false;
    if (meta.network === 'different' && a.networkId === fromAsset.networkId) return false;
    if (meta.asset === 'same' && a.id !== fromAsset.id) return false;
    if (meta.asset === 'different' && a.id === fromAsset.id) return false;
    return true;
  };

  const providerOptions: PickerOption[] = [
    ...PLATFORMS.filter((p) => (draft.kind.startsWith('platform') ? true : p.roles.includes('bridge') || p.roles.includes('swap'))).map((p) => ({
      value: p.id,
      label: p.name,
      sub: <bdi dir="ltr">{p.url}</bdi>,
      icon: <LogoImage src={p.logo} label={p.name} size={28} square />
    })),
    { value: OTHER_PROVIDER_ID, label: 'سایر (نام دلخواه)', icon: <LogoImage src={null} label="؟" size={28} square /> }
  ];

  const [pricing, setPricing] = useState<string | null>(null);
  /** ارزش دلاری از قیمت تاریخی: سمت استیبل‌کوین (کم‌نوسان‌تر) اولویت دارد، وگرنه سمت مبدا */
  async function fetchValuation() {
    if (draft.occurredAt === null) return toast('error', 'ابتدا زمان وقوع را وارد کنید');
    const sides = [
      { asset: toAsset, amount: normalized.to.amount },
      { asset: fromAsset, amount: normalized.from.amount }
    ].filter((x) => x.asset?.coingeckoId && x.amount);
    const stable = sides.find((x) => ['usd-coin', 'tether', 'usdt0', 'global-dollar'].includes(x.asset!.coingeckoId!));
    const pick = stable ?? sides.find((x) => x.asset === fromAsset) ?? sides[0];
    if (!pick) return toast('error', 'برای این دارایی‌ها قیمت مرجع در دسترس نیست — ارزش را دستی وارد کنید');
    setPricing('valuation');
    try {
      const p = await priceAt(pick.asset!.coingeckoId!, draft.occurredAt);
      if (!p) return toast('error', 'قیمت تاریخی برای این زمان پیدا نشد — ارزش را دستی وارد کنید');
      const usd = (Number(pick.amount) * p.usd).toFixed(2);
      set({ valuation: { usdValue: usd, source: `${p.source} ${pick.asset!.name} (${fmtDateTime(p.at)})`, at: p.at } });
    } finally {
      setPricing(null);
    }
  }
  async function fetchFeeValue(i: number) {
    const f = normalized.fees[i];
    const fa = f.assetId ? d.assetById.get(f.assetId) : undefined;
    if (draft.occurredAt === null) return toast('error', 'ابتدا زمان وقوع را وارد کنید');
    if (!fa?.coingeckoId || !f.amount) return toast('error', 'برای این دارایی قیمت مرجع در دسترس نیست — ارزش را دستی وارد کنید');
    setPricing(`fee-${i}`);
    try {
      const p = await priceAt(fa.coingeckoId, draft.occurredAt);
      if (!p) return toast('error', 'قیمت تاریخی پیدا نشد — ارزش را دستی وارد کنید');
      setFee(i, { usdValue: (Number(f.amount) * p.usd).toFixed(4), usdValueSource: `${p.source} (${fmtDateTime(p.at)})` });
    } finally {
      setPricing(null);
    }
  }

  const showErr = (k: string) => (submitted ? errors[k] : undefined);
  const hasErrors = Object.keys(errors).length > 0;

  const addFee = () =>
    set({
      fees: [
        ...draft.fees,
        { id: newId(), kind: draft.providerId === 'relay' ? 'bridge_and_platform' : 'network', amount: null, assetId: null, holdingId: null, treatment: 'separate', verification: 'user_reported' }
      ]
    });
  const setFee = (i: number, p: Partial<Fee>) => set({ fees: draft.fees.map((f, j) => (j === i ? { ...f, ...p } : f)) });

  async function submit() {
    setSubmitted(true);
    if (hasErrors) {
      toast('error', 'فرم خطا دارد — موارد مشخص‌شده را اصلاح کنید');
      return;
    }
    if (blockingDup) return;
    if (warnDup.length > 0 && !confirmDup) return;
    setSaving(true);
    try {
      const now = Date.now();
      const record: Operation = isEdit
        ? applyEdit(initial!, normalized, now)
        : { ...normalized, createdAt: now, updatedAt: now, history: [{ at: now, action: 'created', summary: 'ثبت دستی توسط کاربر' }] };
      await saveOperation(record);
      toast('success', isEdit ? 'تغییرات ثبت شد' : 'عملیات ثبت شد (هیچ تراکنشی اجرا نشد)');
      onClose();
    } catch {
      toast('error', 'ذخیره ناموفق بود');
    } finally {
      setSaving(false);
    }
  }

  const legEditor = (side: 'from' | 'to') => {
    const leg = draft[side];
    const holding = side === 'from' ? fromHolding : toHolding;
    const kinds = side === 'from' ? meta.fromKinds : meta.toKinds;
    const assetFilter = side === 'from' ? legAssetFilter(holding) : toAssetFilter;
    const asset = side === 'from' ? fromAsset : toAsset;
    const avail = side === 'from' && leg.holdingId && leg.assetId ? availableBalance(d.operations, leg.holdingId, leg.assetId, isEdit ? draft.id : undefined) : null;
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={side === 'from' ? 'محل مبدا' : 'محل مقصد'} error={showErr(`${side}.holdingId`)}>
          <EntityPicker
            label={side === 'from' ? 'محل مبدا' : 'محل مقصد'}
            value={leg.holdingId}
            options={holdingOptions(d, kinds)}
            onChange={(v) => {
              const h = v ? d.holdingById.get(v) : undefined;
              const keep = leg.assetId && legAssetFilter(h)(d.assetById.get(leg.assetId)!);
              setLeg(side, { holdingId: v, assetId: keep ? leg.assetId : h?.kind === 'arcus' && h.arcus ? arcusCollateralAssetId(h.arcus.env) : null });
            }}
            invalid={!!showErr(`${side}.holdingId`)}
            emptyText="محلی ثبت نشده — از تب «محل‌ها» اضافه کنید"
          />
        </Field>
        <Field label={side === 'from' ? 'دارایی و شبکهٔ مبدا' : 'دارایی و شبکهٔ مقصد'} error={showErr(`${side}.assetId`)}>
          <EntityPicker
            label={side === 'from' ? 'دارایی مبدا' : 'دارایی مقصد'}
            value={leg.assetId}
            options={assetOptions(d, assetFilter)}
            onChange={(v) => setLeg(side, { assetId: v })}
            invalid={!!showErr(`${side}.assetId`)}
          />
        </Field>
        <Field
          label={
            draft.kind === 'balance_adjustment'
              ? 'مقدار'
              : side === 'from'
                ? draft.kind === 'platform_deposit'
                  ? 'مقدار ارسالی از مبدا'
                  : 'مقدار خروجی از مبدا'
                : draft.kind === 'platform_deposit'
                  ? 'مقدار اعتبارگرفته در پلتفرم'
                  : 'مقدار ورودی به مقصد'
          }
          className="sm:col-span-2"
          error={showErr(`${side}.amount`)}
          hint={
            avail !== null
              ? `موجودی ثبت‌شده: ${formatAmount(avail)} ${asset?.name ?? ''}${asset?.decimals != null ? ` · حداکثر ${asset.decimals} رقم اعشار` : ''}`
              : asset?.decimals != null
                ? `حداکثر ${asset.decimals} رقم اعشار · خالی = نامعلوم`
                : 'خالی = نامعلوم (صفر فرض نمی‌شود)'
          }
        >
          <Input
            dir="ltr"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={leg.amount ?? ''}
            onChange={(e) => setLeg(side, { amount: e.target.value === '' ? null : e.target.value })}
            suffix={asset ? <AssetLogoFor asset={asset} network={asset.networkId ? d.networkById.get(asset.networkId) : undefined} size={22} /> : undefined}
          />
        </Field>
      </div>
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? 'ویرایش عملیات' : 'ثبت عملیات جدید'}
      description="ثبت دستی؛ بدون اجرای تراکنش"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button onClick={submit} loading={saving} disabled={!!blockingDup || (warnDup.length > 0 && !confirmDup)}>
            {isEdit ? 'ذخیرهٔ تغییرات' : 'ثبت عملیات'}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {!isEdit && (
          <Field label="نوع عملیات">
            <ChipGroup label="نوع عملیات" options={OPERATION_KINDS.map((k) => ({ value: k, label: KIND_META[k].short }))} value={draft.kind} onChange={changeKind} />
          </Field>
        )}
        <p className="-mt-3 text-xs text-muted">{meta.description}</p>

        {draft.kind === 'balance_adjustment' ? (
          <section className="space-y-3">
            <SegmentedControl
              label="جهت تعدیل"
              options={[
                { value: 'increase', label: 'افزایش موجودی' },
                { value: 'decrease', label: 'کاهش موجودی' }
              ]}
              value={direction}
              onChange={setDirection}
              fill
            />
            {showErr('direction') && <p className="text-xs text-negative">{errors.direction}</p>}
            {legEditor(direction === 'increase' ? 'to' : 'from')}
          </section>
        ) : (
          <>
            <section aria-label="مبدا" className="space-y-3">
              <h3 className="text-sm font-bold text-ink">مبدا</h3>
              {legEditor('from')}
            </section>
            <div className="flex justify-center text-subtle" aria-hidden>
              <ArrowDown className="h-5 w-5" />
            </div>
            <section aria-label="مقصد" className="space-y-3">
              <h3 className="text-sm font-bold text-ink">مقصد</h3>
              {legEditor('to')}
            </section>
          </>
        )}

        <section className="grid gap-3 sm:grid-cols-2">
          <Field label="وضعیت">
            <Select value={draft.status} onChange={(e) => set({ status: e.target.value as Operation['status'] })}>
              {(Object.keys(STATUS_LABEL) as Operation['status'][]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="روش تأیید" hint="«تکمیل‌شده» طبق اعلام شما با «تأییدشده از منبع خارجی» یکی نیست">
            <Select value={draft.verification} onChange={(e) => set({ verification: e.target.value as Verification })}>
              {(['user_reported', 'user_checked_explorer'] as Verification[]).map((v) => (
                <option key={v} value={v}>
                  {VERIFICATION_LABEL[v]}
                </option>
              ))}
              {draft.verification === 'api_matched' && <option value="api_matched">{VERIFICATION_LABEL.api_matched}</option>}
            </Select>
          </Field>
          <Field label="زمان وقوع" hint={draft.timeZone ? `منطقهٔ زمانی: ${draft.timeZone}` : 'خالی = نامعلوم'} className="sm:col-span-2">
            <DateTimeField value={draft.occurredAt} onChange={(ms, tz) => set({ occurredAt: ms, timeZone: tz })} />
          </Field>
        </section>

        {draft.kind === 'balance_adjustment' && direction === 'increase' && (
          <Notice tone="neutral">
            <label className="flex items-start gap-2 text-ink">
              <input type="checkbox" className="mt-1" checked={draft.ledgerPosting === 'opening'} onChange={(e) => set({ ledgerPosting: e.target.checked ? 'opening' : 'none' })} />
              <span>
                در حسابداری هم به‌عنوان «واریز / موجودی اولیه» ثبت شود
                <span className="block text-xs text-muted">اگر همین موجودی را قبلاً در بخش حسابداری ثبت کرده‌اید، تیک نزنید تا دوبار شمرده نشود.</span>
              </span>
            </label>
          </Notice>
        )}

        {needsValuation && (
          <section className="space-y-2 rounded-card border border-divider p-3">
            <h3 className="text-sm font-bold text-ink">ارزش دلاری (برای حسابداری و سود و زیان)</h3>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="ارزش عملیات" error={showErr('valuation')} className="min-w-[180px] flex-1" hint={draft.valuation?.source ? `منبع: ${draft.valuation.source}` : 'اگر خالی بماند، این عملیات تا وقتی ارزشش را وارد کنید در حسابداری حساب نمی‌شود'}>
                <Input
                  dir="ltr"
                  inputMode="decimal"
                  value={draft.valuation?.usdValue ?? ''}
                  onChange={(e) => set({ valuation: e.target.value === '' ? null : { usdValue: e.target.value, source: 'ورود دستی کاربر', at: Date.now() } })}
                  suffix="دلار"
                />
              </Field>
              <Button variant="secondary" loading={pricing === 'valuation'} onClick={fetchValuation}>
                از قیمت تاریخی
              </Button>
            </div>
          </section>
        )}

        {meta.provider && (
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-ink">ارائه‌دهنده و رهگیری</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="ارائه‌دهنده">
                <EntityPicker label="ارائه‌دهنده" value={draft.providerId} options={providerOptions} onChange={(v) => set({ providerId: v })} allowClear placeholder="نامشخص" />
              </Field>
              {draft.providerId === OTHER_PROVIDER_ID && (
                <Field label="نام ارائه‌دهنده" error={showErr('providerName')}>
                  <Input value={draft.providerName ?? ''} onChange={(e) => set({ providerName: e.target.value })} maxLength={60} />
                </Field>
              )}
              <Field
                label={draft.providerId === 'relay' ? 'شناسهٔ درخواست ریلی' : 'شناسهٔ عملیات نزد ارائه‌دهنده'}
                hint="برای جلوگیری از ثبت تکراری استفاده می‌شود"
              >
                <Input dir="ltr" autoComplete="off" value={draft.providerRef ?? ''} onChange={(e) => set({ providerRef: e.target.value })} maxLength={200} />
              </Field>
              <Field label="هش تراکنش مبدا" error={showErr('sourceTxHash')}>
                <Input dir="ltr" autoComplete="off" spellCheck={false} placeholder="0x…" value={draft.sourceTxHash ?? ''} onChange={(e) => set({ sourceTxHash: e.target.value })} />
              </Field>
              <Field label="هش تراکنش مقصد" error={showErr('destTxHash')}>
                <Input dir="ltr" autoComplete="off" spellCheck={false} placeholder="0x…" value={draft.destTxHash ?? ''} onChange={(e) => set({ destTxHash: e.target.value })} />
              </Field>
              <Field
                label="لینک رهگیری"
                error={showErr('trackingUrl')}
                hint="پیوند صفحهٔ همان تراکنش (نه صفحهٔ عمومی ریلی)"
                className="sm:col-span-2"
              >
                <Input dir="ltr" type="url" autoComplete="off" placeholder="https://…" value={draft.trackingUrl ?? ''} onChange={(e) => set({ trackingUrl: e.target.value })} />
              </Field>
            </div>
          </section>
        )}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink">هزینه‌ها</h3>
            <Button size="sm" variant="secondary" icon={<Plus />} onClick={addFee}>
              افزودن هزینه
            </Button>
          </div>
          {draft.fees.length === 0 && (
            <p className="text-xs text-muted">
              هزینه‌ای ثبت نشده. اگر سهم کارمزد بریج و پلتفرم (مثل ریلی) جدا مشخص نیست، نوع «تجمیعی» را انتخاب کنید — مبلغ تجمیعی بین اجزا تقسیم نمی‌شود.
            </p>
          )}
          {draft.fees.map((f, i) => {
            const fa = f.assetId ? d.assetById.get(f.assetId) : undefined;
            return (
              <div key={f.id} className="space-y-3 rounded-card border border-divider p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="نوع هزینه">
                    <Select value={f.kind} onChange={(e) => setFee(i, { kind: e.target.value as FeeKind })}>
                      {(Object.keys(FEE_KIND_LABEL) as FeeKind[]).map((k) => (
                        <option key={k} value={k}>
                          {FEE_KIND_LABEL[k]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="نحوهٔ لحاظ‌شدن">
                    <Select value={f.treatment} onChange={(e) => setFee(i, { treatment: e.target.value as FeeTreatment })}>
                      {(Object.keys(TREATMENT_LABEL) as FeeTreatment[]).map((k) => (
                        <option key={k} value={k}>
                          {TREATMENT_LABEL[k]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="دارایی و شبکهٔ پرداخت" error={showErr(`fees.${i}.assetId`)}>
                    <EntityPicker label="دارایی کارمزد" value={f.assetId} options={assetOptions(d)} onChange={(v) => setFee(i, { assetId: v })} />
                  </Field>
                  <Field label="مقدار" error={showErr(`fees.${i}.amount`)} hint="خالی = نامعلوم">
                    <Input
                      dir="ltr"
                      inputMode="decimal"
                      value={f.amount ?? ''}
                      onChange={(e) => setFee(i, { amount: e.target.value === '' ? null : e.target.value })}
                      suffix={fa ? <AssetLogoFor asset={fa} network={fa.networkId ? d.networkById.get(fa.networkId) : undefined} size={22} /> : undefined}
                    />
                  </Field>
                  {f.treatment === 'separate' && (
                    <Field label="پرداخت‌شده از محل" error={showErr(`fees.${i}.holdingId`)}>
                      <EntityPicker label="محل پرداخت کارمزد" value={f.holdingId} options={holdingOptions(d)} onChange={(v) => setFee(i, { holdingId: v })} />
                    </Field>
                  )}
                  {f.treatment === 'separate' && (
                    <Field label="ارزش دلاری کارمزد" error={showErr(`fees.${i}.usdValue`)} hint={f.usdValueSource ? `منبع: ${f.usdValueSource}` : 'برای حساب‌کردن کارمزد در حسابداری'}>
                      <div className="flex gap-2">
                        <Input dir="ltr" inputMode="decimal" value={f.usdValue ?? ''} onChange={(e) => setFee(i, { usdValue: e.target.value === '' ? null : e.target.value, usdValueSource: 'ورود دستی کاربر' })} suffix="دلار" />
                        <Button size="sm" variant="secondary" loading={pricing === `fee-${i}`} onClick={() => fetchFeeValue(i)}>
                          قیمت
                        </Button>
                      </div>
                    </Field>
                  )}
                  <Field label="منبع و تأیید">
                    <Select value={f.verification} onChange={(e) => setFee(i, { verification: e.target.value as Verification })}>
                      {(['user_reported', 'user_checked_explorer'] as Verification[]).map((v) => (
                        <option key={v} value={v}>
                          {VERIFICATION_LABEL[v]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="flex justify-end">
                  <Button size="sm" variant="destructive" icon={<Trash2 />} onClick={() => set({ fees: draft.fees.filter((_, j) => j !== i) })}>
                    حذف هزینه
                  </Button>
                </div>
              </div>
            );
          })}
        </section>

        <Field label="یادداشت (اختیاری)">
          <textarea
            className="min-h-[80px] w-full rounded-field border border-divider-strong bg-card px-3.5 py-2.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            maxLength={2000}
            value={draft.note ?? ''}
            onChange={(e) => set({ note: e.target.value })}
          />
        </Field>

        <section className="space-y-2 rounded-card bg-surface-2/70 p-4" aria-live="polite">
          <h3 className="text-sm font-bold text-ink">پیش‌نمایش اثر روی موجودی</h3>
          {effects.length === 0 ? (
            <p className="text-xs text-muted">
              {normalized.status === 'failed' ? 'عملیات ناموفق اثری ندارد (جز کارمزد شبکهٔ جداگانه، اگر ثبت شود).' : 'پس از انتخاب محل، دارایی و مقدار، اثر این‌جا نمایش داده می‌شود.'}
            </p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {effects.map((e, i) => {
                const a = d.assetById.get(e.assetId);
                const amount = e.delta.replace('-', '');
                return (
                  <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <HoldingChip holdingId={e.holdingId} d={d} size={18} />
                    <span className="text-muted">
                      {e.role === 'in' ? 'افزایش' : e.role === 'in_transit' ? 'در حال انتقال (هنوز به مقصد نرسیده)' : e.role === 'fee' ? 'کسر کارمزد جداگانه' : 'کاهش'}
                    </span>
                    <bdi dir="ltr" className="font-semibold tabular-nums">
                      {formatAmount(amount, 18)}
                    </bdi>
                    <AssetChip assetId={e.assetId} d={d} size={16} />
                  </li>
                );
              })}
            </ul>
          )}
          {normalized.fees.some((f) => f.treatment !== 'separate' && f.amount) && (
            <p className="text-xs text-muted">کارمزدهای «داخل مقدار» فقط برای اطلاع ثبت می‌شوند و دوباره از موجودی کم نمی‌شوند.</p>
          )}
          {fromAsset && toAsset && fromAsset.id !== toAsset.id && normalized.from.amount && normalized.to.amount && !isZero(sub(normalized.from.amount, normalized.to.amount)) && (
            <p className="text-xs text-muted">اختلاف تعداد دو دارایی متفاوت خودکار «کارمزد» یا «زیان» حساب نمی‌شود؛ هزینهٔ واقعی را جدا ثبت کنید.</p>
          )}
        </section>

        {needsValuation && !normalized.valuation && (
          <Notice tone="warn">برای ورود این عملیات به حسابداری، ارزش دلاری را ثبت کنید.</Notice>
        )}
        {validation.warnings.map((w) => (
          <Notice key={w} tone="warn">
            {w}
          </Notice>
        ))}
        {balanceWarnings.map((w) => (
          <Notice key={w} tone="warn">
            {w}
          </Notice>
        ))}
        {blockingDup && (
          <Notice tone="error" title="ثبت تکراری">
            عملیات دیگری با همین {blockingDup.key.label} قبلاً ثبت شده است. به‌جای ثبت دوباره، همان را ویرایش کنید.
          </Notice>
        )}
        {warnDup.length > 0 && (
          <Notice tone="warn" title="احتمال ثبت تکراری">
            <p>عملیات دیگری با همین {warnDup.map((w) => w.key.label).join(' و ')} وجود دارد. فقط برابری مبلغ یا تاریخ دلیل یکسان‌بودن نیست، ولی هش یکسان معمولاً یعنی همان رویداد.</p>
            <label className="mt-2 flex items-center gap-2 text-ink">
              <input type="checkbox" checked={confirmDup} onChange={(e) => setConfirmDup(e.target.checked)} />
              مطمئنم این یک عملیات جداگانه است
            </label>
          </Notice>
        )}
        {submitted && hasErrors && <Notice tone="error">برخی فیلدها خطا دارند.</Notice>}
      </div>
    </Sheet>
  );
}
