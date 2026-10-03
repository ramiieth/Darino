import { approvedNetwork } from '@/shared/lib/approvedNetworks';
/**
 * مدیریت محل‌های نگهداری، شبکه‌ها و توکن‌های واردشده توسط کاربر
 *  • فقط آدرس عمومی — هیچ کلید خصوصی، Seed Phrase یا API Signing Key درخواست/ذخیره نمی‌شود.
 *  • شبکه/توکن واردشده توسط کاربر برچسب «واردشده توسط کاربر» دارد و کاتالوگ تأییدشده را بازنویسی نمی‌کند.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, Archive } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { Field, Input, SearchField, Select } from '@/shared/components/ui/Input';
import { Sheet } from '@/shared/components/ui/Sheet';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { LogoImage } from '@/shared/components/ui/EntityLogo';
import { toast } from '@/shared/store/toastStore';
import { PLATFORMS, nativeAssetId, tokenAssetId } from '../domain/catalog';
import { newId } from '../domain/ledger';
import { isEvmAddress } from '../domain/links';
import type { ArcusEnv, Asset, Holding, HoldingKind, Network } from '../domain/types';
import { saveCustomAsset, saveCustomNetwork, saveHolding, wipeCustodyData } from '../data/repository';
import type { CustodyData } from '../data/useCustody';
import { EntityPicker, HoldingIcon, HOLDING_KIND_LABEL } from './parts';
import { loadChainDirectory, type DirectoryChain } from '../data/chainDirectory';
import { normalizeForSearch } from '@/shared/utils/formatters';
import { clearArcusMemory } from '@/features/arcus/data/useArcusAccount';

export function HoldingForm({ open, onClose, initial, presetKind, d }: { open: boolean; onClose: () => void; initial?: Holding | null; presetKind?: HoldingKind; d: CustodyData }) {
  const [kind, setKind] = useState<HoldingKind>(initial?.kind ?? presetKind ?? 'wallet');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [address, setAddress] = useState(initial?.address ?? initial?.arcus?.address ?? '');
  const [platformId, setPlatformId] = useState(initial?.platformId ?? '');
  const [env, setEnv] = useState<ArcusEnv>(initial?.arcus?.env ?? 'mainnet');
  const [accountIndex, setAccountIndex] = useState(String(initial?.arcus?.accountIndex ?? ''));
  const [note, setNote] = useState(initial?.note ?? '');
  const [submitted, setSubmitted] = useState(false);
  // هویت زیرحساب Arcus پس از ذخیره ثابت است (عملیات‌ها و رکوردهای ربط‌داده‌شده به آن وابسته‌اند)
  const lockArcus = !!initial && initial.kind === 'arcus';

  const errors: Record<string, string> = {};
  if (!label.trim()) errors.label = 'یک نام برای این محل وارد کنید';
  if (kind === 'arcus' && !isEvmAddress(address)) errors.address = 'آدرس عمومی باید 0x و ۴۰ رقم هگز باشد';
  // کیف پول: آدرس EVM یا آدرس عمومی شبکه‌های دیگر (سولانا، بیت‌کوین، ترون…)
  if (kind === 'wallet' && address.trim() && !isEvmAddress(address) && !/^[A-Za-z0-9:._-]{20,120}$/.test(address.trim())) {
    errors.address = 'آدرس عمومی معتبر نیست';
  }
  const idx = Number(accountIndex);
  if (kind === 'arcus' && (accountIndex.trim() === '' || !Number.isInteger(idx) || idx < 0 || idx > 9)) errors.accountIndex = 'عددی بین ۰ تا ۹';
  if (kind === 'arcus') {
    const dup = d.holdings.find(
      (h) => h.id !== initial?.id && h.kind === 'arcus' && h.arcus?.env === env && h.arcus.address.toLowerCase() === address.trim().toLowerCase() && h.arcus.accountIndex === idx
    );
    if (dup) errors.accountIndex = `این زیرحساب قبلاً با نام «${dup.label}» ذخیره شده`;
  }

  async function submit() {
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    const now = Date.now();
    const h: Holding = {
      id: initial?.id ?? newId(),
      kind,
      label: label.trim(),
      address: kind === 'wallet' && address.trim() ? address.trim() : null,
      platformId: kind === 'platform' ? platformId || null : null,
      arcus: kind === 'arcus' ? { env, address: address.trim(), accountIndex: idx } : undefined,
      note: note.trim() || undefined,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
      archivedAt: initial?.archivedAt ?? null
    };
    await saveHolding(h);
    toast('success', 'ذخیره شد');
    onClose();
  }

  const err = (k: string) => (submitted ? errors[k] : undefined);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={initial ? 'ویرایش محل نگهداری' : 'افزودن محل نگهداری'}
      description="فقط آدرس عمومی؛ بدون کلید خصوصی"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button onClick={submit}>ذخیره</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="نوع">
          <Select value={kind} onChange={(e) => setKind(e.target.value as HoldingKind)} disabled={!!initial}>
            {(Object.keys(HOLDING_KIND_LABEL) as HoldingKind[]).map((k) => (
              <option key={k} value={k}>
                {HOLDING_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="نام" error={err('label')}>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder={kind === 'arcus' ? 'مثلاً آرکوس — اصلی' : 'مثلاً کیف پول اصلی'} />
        </Field>
        {(kind === 'wallet' || kind === 'arcus') && (
          <Field
            label={kind === 'arcus' ? 'آدرس عمومی کیف پول' : 'آدرس عمومی (اختیاری)'}
            error={err('address')}
            hint={kind === 'wallet' ? 'یک آدرس 0x روی همهٔ شبکه‌های سازگار با اتریوم معتبر است؛ شبکه در سطح دارایی مشخص می‌شود. آدرس شبکه‌های دیگر (مثل سولانا) هم پذیرفته می‌شود.' : undefined}
          >
            <Input dir="ltr" autoComplete="off" spellCheck={false} placeholder="0x…" value={address} onChange={(e) => setAddress(e.target.value)} disabled={lockArcus} />
          </Field>
        )}
        {kind === 'platform' && (
          <Field label="پلتفرم">
            <Select value={platformId} onChange={(e) => setPlatformId(e.target.value)}>
              <option value="">سایر / بدون انتخاب</option>
              {PLATFORMS.filter((p) => p.id !== 'arcus').map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {kind === 'arcus' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="محیط">
              <Select value={env} onChange={(e) => setEnv(e.target.value as ArcusEnv)} disabled={lockArcus}>
                <option value="mainnet">شبکهٔ اصلی</option>
                <option value="testnet">شبکهٔ آزمایشی</option>
              </Select>
            </Field>
            <Field label="شمارهٔ زیرحساب" error={err('accountIndex')} hint="۰ = حساب اصلی · ۱ تا ۹ = زیرحساب‌ها">
              <Input dir="ltr" inputMode="numeric" disabled={lockArcus} value={accountIndex} onChange={(e) => setAccountIndex(e.target.value.replace(/[^\d۰-۹]/g, '').replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))))} />
            </Field>

          </div>
        )}
        <Field label="یادداشت (اختیاری)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </Field>
      </div>
    </Sheet>
  );
}

function NetworkForm({ open, onClose, d }: { open: boolean; onClose: () => void; d: CustodyData }) {
  const [dir, setDir] = useState<DirectoryChain[] | null>(null);
  const [dirError, setDirError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<DirectoryChain | null>(null);
  const [manual, setManual] = useState(false);
  const [nameFa, setNameFa] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [chainId, setChainId] = useState('');
  const [isEvm, setIsEvm] = useState(true);
  const [nativeSymbol, setNativeSymbol] = useState('');
  const [explorer, setExplorer] = useState('');
  const [isTestnet, setIsTestnet] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let alive = true;
    loadChainDirectory()
      .then((l) => alive && setDir(l))
      .catch((e) => alive && setDirError(e instanceof Error ? e.message : 'خطا'));
    return () => {
      alive = false;
    };
  }, []);

  const choose = (c: DirectoryChain) => {
    setPicked(c);
    setManual(false);
    setNameFa(c.nameFa ?? c.name);
    setNameEn(c.name);
    setChainId(c.chainId ? String(c.chainId) : '');
    setIsEvm(c.chainId !== null);
    setNativeSymbol(c.tokenSymbol ?? '');
  };

  const filtered = useMemo(() => {
    const nq = normalizeForSearch(q);
    const list = dir ?? [];
    return (nq ? list.filter((c) => normalizeForSearch(`${c.name} ${c.nameFa ?? ''} ${c.chainId ?? ''} ${c.tokenSymbol ?? ''}`).includes(nq)) : list).slice(0, 80);
  }, [dir, q]);

  const cid = Number(chainId);
  const id = isEvm ? `evm-${cid}` : `chain-${nameEn.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  const errors: Record<string, string> = {};
  if (!nameFa.trim()) errors.nameFa = 'نام فارسی شبکه را وارد کنید';
  if (!nameEn.trim()) errors.nameEn = 'نام انگلیسی شبکه را وارد کنید';
  if (isEvm) {
    if (!Number.isInteger(cid) || cid <= 0) errors.chainId = 'شناسهٔ شبکه باید عدد مثبت باشد';
    else if (d.networks.some((n) => n.chainId === cid)) errors.chainId = 'این شبکه قبلاً اضافه شده است';
  } else if (d.networks.some((n) => n.id === id)) errors.nameEn = 'این شبکه قبلاً اضافه شده است';
  if (!nativeSymbol.trim()) errors.nativeSymbol = 'نماد توکن اصلی شبکه را وارد کنید';
  if (explorer.trim()) {
    try {
      if (new URL(explorer.trim()).protocol !== 'https:') errors.explorer = 'فقط نشانی امن (https) پذیرفته می‌شود';
    } catch {
      errors.explorer = 'نشانی نامعتبر است';
    }
  }

  async function submit() {
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    const now = Date.now();
    const n: Network = {
      id,
      name: nameFa.trim(),
      nameEn: nameEn.trim(),
      kind: isEvm ? 'evm' : 'other',
      chainId: isEvm ? cid : null,
      isTestnet,
      explorerUrl: explorer.trim() ? new URL(explorer.trim()).origin : null,
      logo: picked ? picked.logo : null,
      nativeAssetId: nativeAssetId(id),
      origin: 'user',
      source: picked ? 'defillama' : 'manual',
      updatedAt: now
    };
    await saveCustomNetwork(n);
    // توکن اصلی شبکه — decimals تأییدنشده می‌ماند مگر خودتان ثبت کنید
    await saveCustomAsset({
      id: n.nativeAssetId,
      symbol: nativeSymbol.trim(),
      name: `توکن اصلی ${n.name}`,
      nameEn: nativeSymbol.trim(),
      networkId: id,
      contract: null,
      decimals: null,
      isNative: true,
      logo: null,
      coingeckoId: picked?.gasGeckoId ?? undefined,
      origin: 'user',
      updatedAt: now
    });
    toast('success', `شبکهٔ «${n.name}» و توکن اصلی آن اضافه شد`);
    onClose();
  }
  const err = (k: string) => (submitted ? errors[k] : undefined);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="افزودن شبکه"
      description="شبکه را از فهرست کامل دیفای‌لاما انتخاب کنید یا دستی وارد کنید. نشانی کاوشگر بلاکچین و تعداد رقم اعشار در این فهرست نیست و «تأییدنشده» می‌ماند."
      footer={
        picked || manual ? (
          <div className="flex w-full justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              انصراف
            </Button>
            <Button onClick={submit}>ذخیره</Button>
          </div>
        ) : undefined
      }
    >
      {!picked && !manual ? (
        <div className="space-y-3">
          <SearchField value={q} onChange={setQ} placeholder="جست‌وجوی شبکه (نام، شناسه یا نماد)…" autoFocus />
          {dirError && <Notice tone="warn">{dirError} — می‌توانید شبکه را دستی وارد کنید.</Notice>}
          {!dir && !dirError && <p className="py-4 text-center text-sm text-muted">در حال دریافت فهرست شبکه‌ها…</p>}
          <ul className="max-h-[55vh] space-y-0.5 overflow-y-auto">
            {filtered.map((c) => (
              <li key={c.name}>
                <button
                  type="button"
                  disabled={c.inCatalog}
                  onClick={() => choose(c)}
                  className="flex w-full items-center gap-3 rounded-field px-3 py-2.5 text-start hover:bg-surface-2 disabled:opacity-60"
                >
                  <LogoImage src={c.logo} label={c.nameFa ?? c.name} size={28} square />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{c.nameFa ?? c.name}</span>
                    <span className="block truncate text-xs text-muted">
                      <bdi dir="ltr">{c.name}</bdi>
                      {c.chainId ? (
                        <>
                          {' · شناسه '}
                          <bdi dir="ltr">{c.chainId}</bdi>
                        </>
                      ) : (
                        null
                      )}
                      {c.tokenSymbol ? (
                        <>
                          {' · '}
                          <bdi dir="ltr">{c.tokenSymbol}</bdi>
                        </>
                      ) : null}
                    </span>
                  </span>
                  {c.inCatalog && <Badge tone="gain">موجود (تأییدشده)</Badge>}
                </button>
              </li>
            ))}
          </ul>
          <Button variant="outline" className="w-full" onClick={() => setManual(true)}>
            ورود دستی مشخصات شبکه
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {picked && (
            <div className="flex items-center gap-3 rounded-field bg-surface-2 p-3">
              <LogoImage src={picked.logo} label={picked.name} size={32} square />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold text-ink">{picked.nameFa ?? picked.name}</p>
                <p className="text-xs text-muted">از فهرست دیفای‌لاما — شناسه و نماد از آن‌جا، بقیه را خودتان بررسی کنید</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>
                تغییر
              </Button>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="نام فارسی" error={err('nameFa')}>
              <Input value={nameFa} onChange={(e) => setNameFa(e.target.value)} maxLength={60} />
            </Field>
            <Field label="نام انگلیسی" error={err('nameEn')}>
              <Input dir="ltr" value={nameEn} onChange={(e) => setNameEn(e.target.value)} maxLength={60} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={isEvm} onChange={(e) => setIsEvm(e.target.checked)} />
            شبکه دارای شناسه
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {isEvm && (
              <Field label="شناسهٔ شبکه" error={err('chainId')}>
                <Input dir="ltr" inputMode="numeric" value={chainId} onChange={(e) => setChainId(e.target.value.replace(/\D/g, ''))} />
              </Field>
            )}
            <Field label="نماد توکن اصلی (کارمزد)" error={err('nativeSymbol')}>
              <Input dir="ltr" value={nativeSymbol} onChange={(e) => setNativeSymbol(e.target.value)} maxLength={12} />
            </Field>
          </div>
          <Field label="نشانی کاوشگر بلاکچین (اختیاری)" error={err('explorer')} hint="از مستندات رسمی همان شبکه وارد کنید">
            <Input dir="ltr" type="url" value={explorer} onChange={(e) => setExplorer(e.target.value)} placeholder="https://…" />
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={isTestnet} onChange={(e) => setIsTestnet(e.target.checked)} />
            شبکهٔ آزمایشی
          </label>
        </div>
      )}
    </Sheet>
  );
}

function TokenForm({ open, onClose, d }: { open: boolean; onClose: () => void; d: CustodyData }) {
  const [networkId, setNetworkId] = useState(d.networks[0]?.id ?? '');
  const [contract, setContract] = useState('');
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [decimals, setDecimals] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const net = d.networkById.get(networkId);
  const evm = net?.kind !== 'other';
  const dec = decimals.trim() === '' ? null : Number(decimals);
  const ident = contract.trim();
  const validIdent = evm ? isEvmAddress(ident) : /^[A-Za-z0-9:._-]{3,120}$/.test(ident);
  // EVM: هویت با آدرس lowercase · غیر EVM: شناسه حساس به حروف (مثل mint سولانا)
  const id = validIdent ? (evm ? tokenAssetId(networkId, ident) : `${networkId}:${ident}`) : '';
  const errors: Record<string, string> = {};
  if (!networkId) errors.networkId = 'شبکه را انتخاب کنید';
  if (!validIdent) errors.contract = evm ? 'آدرس قرارداد باید 0x و ۴۰ رقم هگز باشد' : 'شناسه یا آدرس توکن را وارد کنید';
  if (!symbol.trim()) errors.symbol = 'نماد را وارد کنید';
  if (dec !== null && (!Number.isInteger(dec) || dec < 0 || dec > 36)) errors.decimals = 'عدد صحیح ۰ تا ۳۶';
  if (id && d.assetById.has(id)) errors.contract = 'این توکن قبلاً ثبت شده است (هویت = شبکه + آدرس)';
  async function submit() {
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    await saveCustomAsset({
      id,
      symbol: symbol.trim(),
      name: name.trim() || symbol.trim(),
      nameEn: symbol.trim(),
      networkId,
      contract: evm ? ident.toLowerCase() : ident,
      decimals: dec,
      isNative: false,
      logo: null,
      origin: 'user',
      updatedAt: Date.now()
    });
    toast('success', 'توکن اضافه شد');
    onClose();
  }
  const err = (k: string) => (submitted ? errors[k] : undefined);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="افزودن توکن"
      description="هویت توکن = شبکه + آدرس قرارداد؛ نماد به‌تنهایی کافی نیست. تعداد رقم اعشار را از قرارداد یا مستند رسمی بررسی کنید."
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button onClick={submit}>ذخیره</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="شبکه" error={err('networkId')}>
          <EntityPicker
            label="شبکه"
            value={networkId}
            onChange={(v) => setNetworkId(v ?? '')}
            options={d.networks.filter(n=>approvedNetwork(n.id)).map((n) => ({
              value: n.id,
              label: approvedNetwork(n.id)?.name??n.name,
              keywords: `${n.nameEn ?? ''} ${n.chainId ?? ''}`,
              icon: <LogoImage src={approvedNetwork(n.id)?.logo??n.logo} label={approvedNetwork(n.id)?.name??n.name} size={28} square />,
              badge: n.origin === 'user' ? <Badge tone="warn">واردشده توسط شما</Badge> : undefined
            }))}
          />
        </Field>
        <Field label={evm ? 'آدرس قرارداد' : 'شناسه یا آدرس توکن'} error={err('contract')}>
          <Input dir="ltr" spellCheck={false} value={contract} onChange={(e) => setContract(e.target.value)} placeholder={evm ? '0x…' : ''} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="نماد" error={err('symbol')}>
            <Input dir="ltr" value={symbol} onChange={(e) => setSymbol(e.target.value)} maxLength={20} />
          </Field>
          <Field label="تعداد رقم اعشار" error={err('decimals')} hint="خالی = تأییدنشده (دقت بررسی نمی‌شود)">
            <Input dir="ltr" inputMode="numeric" value={decimals} onChange={(e) => setDecimals(e.target.value.replace(/\D/g, ''))} />
          </Field>
        </div>
        <Field label="نام فارسی (اختیاری)">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </Field>
      </div>
    </Sheet>
  );
}

export function HoldingsManager({ d }: { d: CustodyData }) {
  const [form, setForm] = useState<{ open: boolean; initial: Holding | null; key: number }>({ open: false, initial: null, key: 0 });
  const [netOpen, setNetOpen] = useState(false);
  const [tokOpen, setTokOpen] = useState(false);
  const [wipeText, setWipeText] = useState('');
  const [showWipe, setShowWipe] = useState(false);

  const active = d.holdings.filter((h) => !h.archivedAt);
  const archived = d.holdings.filter((h) => h.archivedAt);

  return (
    <div className="space-y-6">
      {!d.persistent && <Notice tone="warn">ذخیره‌سازی دائمی مرورگر در دسترس نیست؛ داده‌ها با بستن صفحه از بین می‌روند.</Notice>}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">محل‌های نگهداری</h2>
          <Button icon={<Plus />} onClick={() => setForm({ open: true, initial: null, key: form.key + 1 })}>
            افزودن
          </Button>
        </div>
        {active.length === 0 ? (
          <EmptyState message="محلی ثبت نشده" hint="کیف پول، حساب دستی، حساب پلتفرم یا زیرحساب آرکوس اضافه کنید." />
        ) : (
          <ul className="space-y-2">
            {active.map((h) => (
              <li key={h.id}>
                <Surface className="flex items-center gap-3 p-3">
                  <HoldingIcon holding={h} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{h.label}</p>
                    <p className="truncate text-xs text-muted">
                      {HOLDING_KIND_LABEL[h.kind]}
                      {/* آدرس کیف پول نمایش داده نمی‌شود (فقط در فرم ویرایش) */}
                      {h.arcus && <> · {h.arcus.env === 'mainnet' ? 'شبکهٔ اصلی' : 'شبکهٔ آزمایشی'} · زیرحساب {h.arcus.accountIndex}</>}
                    </p>
                  </div>
                  <Button size="icon-sm" variant="ghost" aria-label={`ویرایش ${h.label}`} onClick={() => setForm({ open: true, initial: h, key: form.key + 1 })}>
                    <Pencil />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`بایگانی ${h.label}`}
                    title="بایگانی (عملیات‌های قبلی حفظ می‌شوند)"
                    onClick={async () => {
                      await saveHolding({ ...h, archivedAt: Date.now(), updatedAt: Date.now() });
                      toast('info', 'بایگانی شد — عملیات‌ها و موجودی‌های قبلی دست نخورده‌اند');
                    }}
                  >
                    <Archive />
                  </Button>
                </Surface>
              </li>
            ))}
          </ul>
        )}
        {archived.length > 0 && (
          <p className="text-xs text-muted">
            {archived.length} محل بایگانی‌شده:{' '}
            {archived.map((h, i) => (
              <button
                key={h.id}
                type="button"
                className="text-accent hover:underline"
                onClick={async () => {
                  await saveHolding({ ...h, archivedAt: null, updatedAt: Date.now() });
                }}
              >
                {h.label} (بازگردانی){i < archived.length - 1 ? '، ' : ''}
              </button>
            ))}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-ink">شبکه‌ها و توکن‌ها</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" icon={<Plus />} onClick={() => setNetOpen(true)}>
              شبکه
            </Button>
            <Button size="sm" variant="outline" icon={<Plus />} onClick={() => setTokOpen(true)}>
              توکن
            </Button>
          </div>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {d.networks.map((n) => (
            <li key={n.id}>
              <Surface className="flex items-center gap-3 p-3">
                <LogoImage src={approvedNetwork(n.id)?.logo??n.logo} label={approvedNetwork(n.id)?.name??n.name} size={28} square />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{n.name}</p>
                  <p className="text-xs text-muted">
                    {n.chainId ? <>شناسه <bdi dir="ltr">{n.chainId}</bdi> · </> : null}{n.isTestnet ? 'آزمایشی' : 'اصلی'} · {d.assets.filter((a) => a.networkId === n.id).length} دارایی
                  </p>
                </div>
                {n.origin === 'user' ? <Badge tone="warn">واردشده توسط شما</Badge> : <Badge tone="gain">تأییدشده</Badge>}
              </Surface>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <Button variant="destructive" icon={<Trash2 />} onClick={() => setShowWipe((s) => !s)}>
          پاک‌کردن دادهٔ این بخش از این دستگاه
        </Button>
        {showWipe && (
          <Notice tone="error" title="حذف کامل و غیرقابل بازگشت">
            <p>همهٔ محل‌ها، عملیات‌ها، شبکه‌ها و توکن‌های واردشده در این بخش و دادهٔ آرکوس در حافظه حذف می‌شوند. سایر بخش‌های دارینو (حسابداری، بازار…) دست نمی‌خورند. برای تأیید «حذف» را بنویسید.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Input value={wipeText} onChange={(e) => setWipeText(e.target.value)} aria-label="تأیید حذف" />
              <Button
                variant="destructive"
                disabled={wipeText.trim() !== 'حذف'}
                onClick={async () => {
                  await wipeCustodyData();
                  clearArcusMemory();
                  setWipeText('');
                  setShowWipe(false);
                  toast('success', 'دادهٔ این بخش از این دستگاه پاک شد');
                }}
              >
                حذف کامل
              </Button>
            </div>
          </Notice>
        )}
      </section>

      {form.open && <HoldingForm key={form.key} open={form.open} initial={form.initial} d={d} onClose={() => setForm((f) => ({ ...f, open: false }))} />}
      {netOpen && <NetworkForm open={netOpen} d={d} onClose={() => setNetOpen(false)} />}
      {tokOpen && <TokenForm open={tokOpen} d={d} onClose={() => setTokOpen(false)} />}
    </div>
  );
}
