/**
 * فهرست عملیات — فیلتر (نوع، شبکه، دارایی، محل، وضعیت، بازهٔ زمانی)،
 * مسیر بصری «مبدا ← ارائه‌دهنده ← مقصد» و جزئیات با لینک explorer و سابقهٔ تغییر.
 */
import { useMemo, useState } from 'react';
import { ArrowLeft, ExternalLink, History, Pencil, PlusCircle, RotateCcw, Ban, Filter } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Badge, type Tone } from '@/shared/components/ui/Badge';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { KeyValueList } from '@/shared/components/ui/FinancialValue';
import { Sheet } from '@/shared/components/ui/Sheet';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { toast } from '@/shared/store/toastStore';
import { formatAmount } from '../domain/decimal';
import { isIncomplete, KIND_META, OPERATION_KINDS, restoreOperation, STATUS_LABEL, VERIFICATION_LABEL, voidOperation } from '../domain/ledger';
import { checkTrackingUrl, explorerTxUrl } from '../domain/links';
import type { Operation, OperationKind } from '../domain/types';
import { saveOperation } from '../data/repository';
import type { CustodyData } from '../data/useCustody';
import { AssetChip, fmtOpTime, HoldingChip, ProviderChip } from './parts';
import { OperationForm } from './OperationForm';

const STATUS_TONE: Record<Operation['status'], Tone> = { pending: 'warn', completed: 'gain', failed: 'loss' };

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className="inline-flex items-center gap-1 text-accent hover:underline">
      {children}
      <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  );
}

function LegView({ leg, d }: { leg: Operation['from']; d: CustodyData }) {
  const a = leg.assetId ? d.assetById.get(leg.assetId) : undefined;
  return (
    <div className="min-w-0 space-y-1">
      <HoldingChip holdingId={leg.holdingId} d={d} size={18} />
      <div className="flex items-center gap-1.5 text-sm">
        <bdi dir="ltr" className="font-bold tabular-nums" title={leg.amount ?? undefined}>
          {leg.amount === null ? '؟' : formatAmount(leg.amount)}
        </bdi>
        <AssetChip assetId={leg.assetId} d={d} size={18} />
      </div>
      {leg.amount === null && a && <span className="text-xs text-warn">مقدار نامعلوم</span>}
    </div>
  );
}

export function RouteView({ op, d }: { op: Operation; d: CustodyData }) {
  const one = KIND_META[op.kind].legs === 'one';
  if (one) return <LegView leg={op.to.holdingId ? op.to : op.from} d={d} />;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <LegView leg={op.from} d={d} />
      <div className="flex flex-col items-center gap-1 text-subtle">
        {op.providerId && <ProviderChip providerId={op.providerId} providerName={op.providerName} size={18} />}
        <ArrowLeft className="h-4 w-4" aria-label="به" />
      </div>
      <LegView leg={op.to} d={d} />
    </div>
  );
}

interface Filters {
  kind: OperationKind | '';
  status: Operation['status'] | '';
  networkId: string;
  assetId: string;
  holdingId: string;
  from: string;
  to: string;
  showVoided: boolean;
}

const EMPTY_FILTERS: Filters = { kind: '', status: '', networkId: '', assetId: '', holdingId: '', from: '', to: '', showVoided: false };

function matches(op: Operation, f: Filters, d: CustodyData): boolean {
  if (!f.showVoided && op.voidedAt) return false;
  if (f.kind && op.kind !== f.kind) return false;
  if (f.status && op.status !== f.status) return false;
  const assetIds = [op.from.assetId, op.to.assetId, ...op.fees.map((x) => x.assetId)].filter(Boolean) as string[];
  if (f.assetId && !assetIds.includes(f.assetId)) return false;
  if (f.networkId && !assetIds.some((a) => d.assetById.get(a)?.networkId === f.networkId)) return false;
  if (f.holdingId && ![op.from.holdingId, op.to.holdingId, ...op.fees.map((x) => x.holdingId)].includes(f.holdingId)) return false;
  if (f.from || f.to) {
    if (op.occurredAt === null) return false;
    if (f.from && op.occurredAt < new Date(f.from + 'T00:00:00').getTime()) return false;
    if (f.to && op.occurredAt > new Date(f.to + 'T23:59:59.999').getTime()) return false;
  }
  return true;
}

export function OperationsPanel({ d }: { d: CustodyData }) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [editing, setEditing] = useState<Operation | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const list = useMemo(
    () =>
      d.operations
        .filter((o) => matches(o, filters, d))
        .sort((a, b) => (b.occurredAt ?? b.createdAt) - (a.occurredAt ?? a.createdAt)),
    [d, filters]
  );
  const detail = detailId ? d.operations.find((o) => o.id === detailId) ?? null : null;
  const setF = (p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p }));
  const activeFilterCount = Object.entries(filters).filter(([k, v]) => k !== 'showVoided' && v).length;

  const openNew = () => {
    setEditing(null);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button icon={<PlusCircle />} onClick={openNew} disabled={d.holdings.length === 0}>
          ثبت عملیات
        </Button>
        <Button variant="outline" icon={<Filter />} onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
          فیلتر{activeFilterCount ? ` (${activeFilterCount})` : ''}
        </Button>
      </div>
      {d.holdings.length === 0 && <Notice tone="info">برای ثبت عملیات، ابتدا از تب «محل‌ها» حداقل یک کیف پول یا حساب اضافه کنید.</Notice>}

      {showFilters && (
        <Surface className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="نوع">
            <Select value={filters.kind} onChange={(e) => setF({ kind: e.target.value as OperationKind | '' })}>
              <option value="">همه</option>
              {OPERATION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_META[k].short}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="وضعیت">
            <Select value={filters.status} onChange={(e) => setF({ status: e.target.value as Operation['status'] | '' })}>
              <option value="">همه</option>
              {(Object.keys(STATUS_LABEL) as Operation['status'][]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="شبکه">
            <Select value={filters.networkId} onChange={(e) => setF({ networkId: e.target.value })}>
              <option value="">همه</option>
              {d.networks.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="دارایی">
            <Select value={filters.assetId} onChange={(e) => setF({ assetId: e.target.value })}>
              <option value="">همه</option>
              {d.assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — {a.networkId ? d.networkById.get(a.networkId)?.name : 'داخل پلتفرم'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="محل نگهداری">
            <Select value={filters.holdingId} onChange={(e) => setF({ holdingId: e.target.value })}>
              <option value="">همه</option>
              {d.holdings.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="از تاریخ">
            <Input type="date" dir="ltr" value={filters.from} onChange={(e) => setF({ from: e.target.value })} />
          </Field>
          <Field label="تا تاریخ">
            <Input type="date" dir="ltr" value={filters.to} onChange={(e) => setF({ to: e.target.value })} />
          </Field>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={filters.showVoided} onChange={(e) => setF({ showVoided: e.target.checked })} />
              نمایش باطل‌شده‌ها
            </label>
            <Button size="sm" variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
              پاک‌کردن
            </Button>
          </div>
        </Surface>
      )}

      {list.length === 0 ? (
        <EmptyState
          message={d.operations.length === 0 ? 'هنوز عملیاتی ثبت نشده' : 'عملیاتی با این فیلتر نیست'}
          hint={
            d.operations.length === 0
              ? 'سواپ، بریج، انتقال داخلی، یا سپرده و برداشت از پلتفرم را این‌جا ثبت کنید. فقط یادداشت می‌شود و تراکنشی اجرا نمی‌شود.'
              : 'فیلترها را تغییر دهید.'
          }
        />
      ) : (
        <ul className="space-y-2">
          {list.map((op) => (
            <li key={op.id}>
              <button type="button" onClick={() => setDetailId(op.id)} className="w-full rounded-card border border-divider bg-card p-3 text-start hover:bg-surface-2/60">
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <Badge tone="brand">{KIND_META[op.kind].short}</Badge>
                  <Badge tone={STATUS_TONE[op.status]}>{STATUS_LABEL[op.status]}</Badge>
                  {op.verification === 'api_matched' && <Badge tone="info">تطبیق‌شده با پلتفرم</Badge>}
                  {op.source === 'arcus_import' && <Badge tone="neutral">از آرکوس</Badge>}
                  {isIncomplete(op) && <Badge tone="warn">ناقص</Badge>}
                  {op.voidedAt && <Badge tone="loss">باطل‌شده</Badge>}
                  <span className="ms-auto text-xs text-muted">{fmtOpTime(op.occurredAt, op.timeZone)}</span>
                </div>
                <RouteView op={op} d={d} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {formOpen && (
        <OperationForm
          key={editing ? `edit-${editing.id}-${editing.revision}` : `new-${formKey}`}
          d={d}
          open={formOpen}
          initial={editing}
          onClose={() => setFormOpen(false)}
        />
      )}

      {detail && (
        <OperationDetail
          op={detail}
          d={d}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            setEditing(detail);
            setDetailId(null);
            setFormOpen(true);
          }}
        />
      )}
    </div>
  );
}

function OperationDetail({ op, d, onClose, onEdit }: { op: Operation; d: CustodyData; onClose: () => void; onEdit: () => void }) {
  const [voidReason, setVoidReason] = useState('');
  const [confirmVoid, setConfirmVoid] = useState(false);
  const netOf = (assetId: string | null) => (assetId ? d.networkById.get(d.assetById.get(assetId)?.networkId ?? '') : undefined);
  const srcLink = explorerTxUrl(netOf(op.from.assetId), op.sourceTxHash);
  const dstLink = explorerTxUrl(netOf(op.to.assetId), op.destTxHash);
  const tracking = op.trackingUrl ? checkTrackingUrl(op.trackingUrl, d.networks) : null;

  // هش خودش نمایش داده نمی‌شود؛ فقط پیوند کاوشگر یا وضعیت ثبت
  const hashRow = (hash: string | null, link: string | null) =>
    hash ? link ? <ExtLink href={link}>مشاهده در کاوشگر</ExtLink> : <span>ثبت‌شده</span> : <span className="text-muted">ثبت نشده</span>;

  return (
    <Sheet
      open
      onClose={onClose}
      size="lg"
      title={KIND_META[op.kind].label}
      description={op.voidedAt ? `باطل‌شده${op.voidReason ? ` — ${op.voidReason}` : ''}` : 'جزئیات ثبت (اجرای تراکنش واقعی ندارد)'}
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2">
          {op.voidedAt ? (
            <Button
              variant="outline"
              icon={<RotateCcw />}
              onClick={async () => {
                await saveOperation(restoreOperation(op));
                toast('success', 'عملیات بازگردانی شد');
              }}
            >
              بازگردانی
            </Button>
          ) : (
            <>
              <Button variant="destructive" icon={<Ban />} onClick={() => setConfirmVoid(true)}>
                باطل‌کردن
              </Button>
              <Button icon={<Pencil />} onClick={onEdit}>
                ویرایش
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        <RouteView op={op} d={d} />
        <KeyValueList
          rows={[
            { label: 'وضعیت', value: STATUS_LABEL[op.status] },
            { label: 'روش تأیید', value: VERIFICATION_LABEL[op.verification] },
            { label: 'منبع ثبت', value: op.source === 'manual' ? 'ثبت دستی' : 'ایجاد از رکورد آرکوس (با تأیید شما)' },
            { label: 'زمان', value: fmtOpTime(op.occurredAt, op.timeZone) },
            ...(op.providerId ? [{ label: 'ارائه‌دهنده', value: <ProviderChip providerId={op.providerId} providerName={op.providerName} /> }] : []),
            ...(op.providerRef ? [{ label: 'شناسهٔ عملیات نزد ارائه‌دهنده', value: 'ثبت‌شده' }] : []),
            { label: 'هش مبدا', value: hashRow(op.sourceTxHash, srcLink) },
            { label: 'هش مقصد', value: hashRow(op.destTxHash, dstLink) },
            ...(op.trackingUrl
              ? [
                  {
                    label: 'لینک رهگیری',
                    value: tracking?.ok ? <ExtLink href={tracking.url}>باز کردن</ExtLink> : <span className="text-muted">پیوند نامعتبر است</span>
                  }
                ]
              : []),
            ...(op.externalRefs.length ? [{ label: 'ربط با منبع خارجی', value: op.externalRefs.some((r) => r.system === 'arcus') ? 'ربط‌داده‌شده با رکورد آرکوس' : 'ربط‌داده‌شده' }] : [])
          ]}
        />

        {op.fees.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-bold text-ink">هزینه‌ها</h3>
            <ul className="space-y-2 text-sm">
              {op.fees.map((f) => (
                <li key={f.id} className="rounded-field bg-surface-2/70 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{f.kind === 'bridge_and_platform' ? 'کارمزد بریج و پلتفرم (تجمیعی)' : f.kind === 'bridge' ? 'کارمزد بریج' : f.kind === 'platform' ? 'کارمزد پلتفرم' : f.kind === 'network' ? 'کارمزد شبکه' : 'سایر'}</span>
                    <bdi dir="ltr" className="tabular-nums">
                      {f.amount === null ? 'نامعلوم' : formatAmount(f.amount, 18)}
                    </bdi>
                    <AssetChip assetId={f.assetId} d={d} size={16} />
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {f.treatment === 'separate' ? 'جداگانه پرداخت شده' : f.treatment === 'included_in_source' ? 'داخل مقدار خروجی' : 'از مقدار دریافتی کم شده'} · {VERIFICATION_LABEL[f.verification]}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {op.note && (
          <section>
            <h3 className="mb-1 text-sm font-bold text-ink">یادداشت</h3>
            {/* متن ساده — هیچ HTML اجرا نمی‌شود */}
            <p className="whitespace-pre-wrap break-words text-sm text-ink">{op.note}</p>
          </section>
        )}

        <Disclosure summary={<span className="inline-flex items-center gap-1.5"><History className="h-4 w-4" /> سابقهٔ تغییر (نسخهٔ {op.revision})</span>}>
          <ul className="space-y-1 text-xs text-muted">
            {op.history.map((h, i) => (
              <li key={i}>
                {fmtOpTime(h.at, null)} — {h.summary}
              </li>
            ))}
          </ul>
        </Disclosure>

        {confirmVoid && (
          <Notice tone="warn" title="باطل‌کردن عملیات">
            <p>اثر این عملیات از موجودی‌ها برداشته می‌شود، ولی رکورد و سابقه‌اش برای پیگیری باقی می‌ماند و قابل بازگردانی است.</p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <Input placeholder="دلیل (اختیاری)" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} maxLength={200} />
              <Button
                variant="destructive"
                onClick={async () => {
                  await saveOperation(voidOperation(op, voidReason.trim()));
                  toast('success', 'عملیات باطل شد');
                  setConfirmVoid(false);
                }}
              >
                تأیید باطل‌کردن
              </Button>
            </div>
          </Notice>
        )}
      </div>
    </Sheet>
  );
}
