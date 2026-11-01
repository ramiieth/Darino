/**
 * ثبت دستی معامله — حداقل تایپ: نماد و جهت با لمس، زمان با «الان / چند ساعت پیش»، قیمت ورود و خروج از بازار
 *
 *   فقط «چقدر» لازم است: به دلار (ارزش پوزیشن)، واحد یا لات — هرکدام را که می‌دانید.
 *   بسته‌شده: قیمت خروج از بازار همان لحظه، یا فقط سود/زیانی که صرافی نشان داد (قیمت خروج از آن حساب می‌شود).
 *   کارمزد و فاندینگ اختیاری‌اند؛ نامعلوم = خالی.
 */
import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Input } from '@/shared/components/ui/Input';
import { Sheet } from '@/shared/components/ui/Sheet';
import { cn } from '@/shared/lib/cn';
import type { Direction } from '../domain/types';
import type { MtTrade } from '../domain/metatrader';
import { contractSizeFor } from '../domain/forex';
import { ALL_CRYPTO, ALL_MT, exitFromPnl, kindOf, LOT_SIZES, recentSymbols, roundPx, unitsFrom, USD_SIZES, type PlanKind, type SizeMode } from '../domain/quick';
import { saveManual, type ManualTrade } from '../data/journalStore';
import { Chip, DirectionPicker, Label, NumInput, PresetNum, SymbolPicker, useMarket, usdShort, WhenPicker } from './quickInputs';
import { fa, parseNum, pnlTone, usd } from './parts';

const VENUES = ['بایننس', 'بای‌بیت', 'OKX', 'بیت‌گت', 'متاتریدر'];

export function ManualTradeSheet({ open, onClose, manual, mt, usedSymbols }: { open: boolean; onClose: () => void; manual: readonly ManualTrade[]; mt: readonly MtTrade[]; usedSymbols: readonly string[] }) {
  // فرم با هر باز شدن از نو ساخته می‌شود (پیش‌فرض‌های تازه، زمان «الان» تازه)
  return open ? <Form onClose={onClose} manual={manual} mt={mt} usedSymbols={usedSymbols} /> : null;
}

function Form({ onClose, manual, mt, usedSymbols }: { onClose: () => void; manual: readonly ManualTrade[]; mt: readonly MtTrade[]; usedSymbols: readonly string[] }) {
  const [now] = useState(() => Math.floor(Date.now() / 60_000) * 60_000);
  const last = useMemo(() => [...manual].sort((a, b) => b.openTime - a.openTime)[0], [manual]);
  const symbols = useMemo(() => recentSymbols([...manual.map((m) => m.symbol), ...usedSymbols], null, 20), [manual, usedSymbols]);
  const venues = useMemo(() => [...new Set([...manual.map((m) => m.venueLabel).filter(Boolean), ...VENUES])].slice(0, 7), [manual]);

  const [symbol, setSymbol] = useState(last?.symbol ?? symbols[0] ?? 'BTC');
  const [direction, setDirection] = useState<Direction>('long');
  const [venue, setVenue] = useState(last?.venueLabel ?? '');
  const [venueTyping, setVenueTyping] = useState(false);
  const [openTime, setOpenTime] = useState(now);
  const [entry, setEntry] = useState<string | null>(null);
  const kind = kindOf(symbol);
  const cs = contractSizeFor(symbol.trim().toUpperCase(), mt).size;
  const [sizeMode, setSizeMode] = useState<SizeMode>(() => (kindOf(last?.symbol ?? symbols[0] ?? 'BTC') === 'mt' && cs ? 'lots' : 'usd'));
  const [sizeVal, setSizeVal] = useState('');
  const [closed, setClosed] = useState(false);
  const [closeTime, setCloseTime] = useState(now);
  const [closeBy, setCloseBy] = useState<'price' | 'pnl'>('price');
  const [exit, setExit] = useState<string | null>(null);
  const [pnl, setPnl] = useState('');
  const [pnlSign, setPnlSign] = useState<1 | -1>(1);
  const [fees, setFees] = useState('');
  const [funding, setFunding] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const market = useMarket(symbol, kind);
  const autoEntry = market.at(openTime);
  const autoExit = closed ? market.at(closeTime) : null;
  const entryStr = entry ?? (autoEntry ? String(roundPx(autoEntry)) : '');
  const exitStr = exit ?? (autoExit ? String(roundPx(autoExit)) : '');
  const e = parseNum(entryStr);
  const units = unitsFrom(sizeMode, parseNum(sizeVal), e, cs);
  const x = closed ? (closeBy === 'pnl' ? (e && units && parseNum(pnl) !== null ? exitFromPnl(e, units, pnlSign * Math.abs(parseNum(pnl)!), direction) : null) : parseNum(exitStr)) : null;
  const gross = closed && e && x && units ? (x - e) * units * (direction === 'long' ? 1 : -1) : null;

  const pickSymbol = (s: string) => {
    setSymbol(s); setEntry(null); setExit(null);
    const k = kindOf(s);
    if (k === 'mt' && sizeMode !== 'lots' && contractSizeFor(s.trim().toUpperCase(), mt).size) { setSizeMode('lots'); setSizeVal(''); }
    if (k === 'crypto' && sizeMode === 'lots') { setSizeMode('usd'); setSizeVal(''); }
  };
  const pickKind = (k: PlanKind) => { if (kindOf(symbol) !== k) pickSymbol(symbols.find((x) => kindOf(x) === k) ?? (k === 'mt' ? ALL_MT[0] : ALL_CRYPTO[0])); };

  async function submit() {
    setErr(null);
    const sym = symbol.trim().toUpperCase();
    if (!sym) return setErr('نماد را انتخاب کنید.');
    if (!e || e <= 0) return setErr('قیمت ورود معلوم نیست؛ از «قیمت بازار» پر کنید یا بنویسید.');
    if (!units) return setErr(sizeMode === 'lots' && !cs ? 'اندازهٔ هر لات این نماد معلوم نیست؛ اندازه را به دلار انتخاب کنید.' : 'اندازهٔ معامله را انتخاب کنید.');
    if (closed && closeTime < openTime) return setErr('زمان خروج باید بعد از ورود باشد.');
    if (closed && !x) return setErr(closeBy === 'pnl' ? 'مبلغ سود یا زیان را بنویسید.' : 'قیمت خروج معلوم نیست.');
    const m: ManualTrade = {
      id: `m${Date.now().toString(36)}`,
      venueLabel: venue.trim().slice(0, 40),
      symbol: sym.slice(0, 20),
      direction,
      openTime,
      closeTime: closed ? closeTime : null,
      entryPx: e,
      exitPx: closed ? roundPx(x!) : null,
      size: units,
      fees: parseNum(fees) === null ? null : Math.abs(parseNum(fees)!),
      funding: parseNum(funding)
    };
    setBusy(true);
    try {
      await saveManual(m);
      onClose();
    } catch {
      setErr('ذخیره نشد؛ دوباره تلاش کنید.');
    } finally {
      setBusy(false);
    }
  }

  const sizeModes: { v: SizeMode; label: string }[] = [
    { v: 'usd', label: 'دلار' },
    ...(kind === 'mt' ? [{ v: 'lots' as const, label: 'لات' }] : []),
    { v: 'units', label: 'تعداد' }
  ];

  const unitToggle = (
    <div className="flex gap-1" role="radiogroup" aria-label="واحد اندازه">
      {sizeModes.map((m) => <button key={m.v} type="button" role="radio" aria-checked={sizeMode === m.v} onClick={() => { setSizeMode(m.v); setSizeVal(''); }} className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', sizeMode === m.v ? 'bg-accent-soft text-accent' : 'text-muted')}>{m.label}</button>)}
    </div>
  );

  const footer = (
    <div className="space-y-2">
      <p className="text-xs leading-5 text-muted">
        <b className={direction === 'long' ? 'text-positive' : 'text-negative'}>{direction === 'long' ? 'لانگ' : 'شورت'}</b> <b className="text-ink" dir="ltr">{symbol.toUpperCase() || '—'}</b>
        {e ? <> · ورود <span className="num-ltr">{fa(e, 5)}</span></> : ' · قیمت ورود؟'}
        {units && e ? <> · {usd(units * e)}{sizeMode === 'lots' ? ` (${fa(parseNum(sizeVal), 2)} لات)` : ''}</> : ' · اندازه؟'}
        {closed ? (gross !== null ? <> · بسته با <b className={pnlTone(gross)}>{usd(gross, true)}</b></> : ' · بسته') : ' · باز'}
      </p>
      {err && <p className="text-xs text-negative">{err}</p>}
      <Button size="lg" className="w-full" icon={<Check />} loading={busy} onClick={() => void submit()}>ثبت معامله</Button>
    </div>
  );

  return (
    <Sheet open onClose={onClose} title="ثبت دستی معامله" description="برای صرافی یا حسابی که وصل نیست. هرچه را نمی‌دانید خالی بگذارید یا از قیمت بازار پر کنید." size="lg" footer={footer}>
      <div className="space-y-5 text-sm">
        <SymbolPicker value={symbol} onChange={pickSymbol} options={symbols} kind={kind} onKind={pickKind} />
        <DirectionPicker value={direction} onChange={setDirection} />

        <div className="grid gap-4 sm:grid-cols-2">
          <WhenPicker label="کی وارد شدید؟" value={openTime} onChange={(t) => { setOpenTime(t); setEntry(null); }} now={now} />
          <NumInput
            label="قیمت ورود"
            value={entryStr}
            onChange={setEntry}
            placeholder={market.covered ? 'در حال دریافت قیمت…' : 'قیمت بازار این نماد را نداریم؛ بنویسید'}
            fill={entry !== null && autoEntry ? () => setEntry(null) : null}
            fillLabel="قیمت بازار همان لحظه"
          />
        </div>
        {entry === null && autoEntry && <p className="-mt-3 text-[11px] text-subtle">قیمت از بازار همان لحظه پر شد (هایپرلیکوئید)؛ اگر قیمت شما فرق داشت، عوضش کنید.</p>}

        {sizeMode === 'units' ? (
          <div>
            <Label aside={unitToggle}>چقدر؟</Label>
            <Input inputMode="decimal" dir="ltr" aria-label="چقدر؟" suffix={symbol.toUpperCase().slice(0, 5)} value={sizeVal} onChange={(ev) => setSizeVal(ev.target.value)} />
          </div>
        ) : (
          <div>
            <PresetNum
              key={sizeMode}
              label="چقدر؟"
              aside={unitToggle}
              values={sizeMode === 'usd' ? USD_SIZES : LOT_SIZES}
              value={sizeVal}
              onChange={setSizeVal}
              format={sizeMode === 'usd' ? usdShort : (n) => `${fa(n, 2)} لات`}
              suffix={sizeMode === 'usd' ? '$' : 'لات'}
            />
            {sizeMode === 'usd' && <p className="mt-1 text-[11px] text-subtle">ارزش پوزیشن = حاشیه × اهرم؛ مثلاً ۱۰۰ دلار با اهرم ۱۰ = ۱K.</p>}
            {sizeMode === 'lots' && !cs && <p className="mt-1 text-[11px] text-warn">اندازهٔ هر لات این نماد معلوم نیست؛ «دلار» را انتخاب کنید.</p>}
          </div>
        )}

        <div>
          <Label>وضعیت</Label>
          <div className="grid grid-cols-2 gap-2">
            <Chip on={!closed} onClick={() => setClosed(false)}>هنوز باز است</Chip>
            <Chip on={closed} onClick={() => setClosed(true)}>بسته شد</Chip>
          </div>
        </div>

        {closed && (
          <div className="space-y-4 rounded-card border border-divider p-3">
            <WhenPicker label="کی بستید؟" value={closeTime} onChange={(t) => { setCloseTime(t); setExit(null); }} now={now} />
            <div className="grid grid-cols-2 gap-2">
              <Chip on={closeBy === 'price'} onClick={() => setCloseBy('price')}>قیمت خروج</Chip>
              <Chip on={closeBy === 'pnl'} onClick={() => setCloseBy('pnl')}>فقط سود/زیان را می‌دانم</Chip>
            </div>
            {closeBy === 'price' ? (
              <NumInput label="قیمت خروج" value={exitStr} onChange={setExit} fill={exit !== null && autoExit ? () => setExit(null) : null} fillLabel="قیمت بازار همان لحظه" />
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Chip on={pnlSign === 1} onClick={() => setPnlSign(1)} className={pnlSign === 1 ? 'border-gain bg-gain/15 text-positive' : ''}>سود کردم</Chip>
                  <Chip on={pnlSign === -1} onClick={() => setPnlSign(-1)} className={pnlSign === -1 ? 'border-negative bg-negative/15 text-negative' : ''}>ضرر کردم</Chip>
                </div>
                <NumInput label="چند دلار؟" value={pnl} onChange={setPnl} suffix="$" placeholder="همان عددی که صرافی نشان داد" />
              </div>
            )}
          </div>
        )}

        <Disclosure summary="کارمزد، فاندینگ و صرافی (اختیاری)">
          <div className="space-y-4">
            <div>
              <Label>صرافی یا پلتفرم</Label>
              <div className="flex flex-wrap gap-1.5">
                {venues.map((v) => <Chip key={v} on={!venueTyping && venue === v} onClick={() => { setVenueTyping(false); setVenue(venue === v ? '' : v); }}>{v}</Chip>)}
                <Chip on={venueTyping} onClick={() => setVenueTyping(true)}>دیگر…</Chip>
              </div>
              {venueTyping && <Input className="mt-2" aria-label="نام صرافی" value={venue} onChange={(ev) => setVenue(ev.target.value)} />}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumInput label="کارمزد کل" value={fees} onChange={setFees} suffix="$" placeholder="نمی‌دانم" />
              <NumInput label="فاندینگ (دریافتی +)" value={funding} onChange={setFunding} suffix="$" placeholder="نمی‌دانم" />
            </div>
          </div>
        </Disclosure>
      </div>
    </Sheet>
  );
}
