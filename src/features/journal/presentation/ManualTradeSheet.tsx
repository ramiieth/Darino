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
import { exitFromPnl, kindOf, recentSymbols, roundPx, unitsFrom, type SizeMode } from '../domain/quick';
import { saveManual, type ManualTrade } from '../data/journalStore';
import { Chip, DirectionPicker, Label, NumInput, SymbolPicker, useMarket, WhenPicker } from './quickInputs';
import { fa, parseNum, pnlTone, usd } from './parts';

const VENUES = ['بایننس', 'بای‌بیت', 'OKX', 'بیت‌گت', 'متاتریدر'];

export function ManualTradeSheet({ open, onClose, manual, mt, usedSymbols }: { open: boolean; onClose: () => void; manual: readonly ManualTrade[]; mt: readonly MtTrade[]; usedSymbols: readonly string[] }) {
  // فرم با هر باز شدن از نو ساخته می‌شود (پیش‌فرض‌های تازه، زمان «الان» تازه)
  return open ? <Form onClose={onClose} manual={manual} mt={mt} usedSymbols={usedSymbols} /> : null;
}

function Form({ onClose, manual, mt, usedSymbols }: { onClose: () => void; manual: readonly ManualTrade[]; mt: readonly MtTrade[]; usedSymbols: readonly string[] }) {
  const [now] = useState(() => Math.floor(Date.now() / 60_000) * 60_000);
  const last = useMemo(() => [...manual].sort((a, b) => b.openTime - a.openTime)[0], [manual]);
  const symbols = useMemo(() => recentSymbols([...manual.map((m) => m.symbol), ...usedSymbols], null), [manual, usedSymbols]);
  const venues = useMemo(() => [...new Set([...manual.map((m) => m.venueLabel).filter(Boolean), ...VENUES])].slice(0, 7), [manual]);

  const [symbol, setSymbol] = useState(last?.symbol ?? symbols[0] ?? 'BTC');
  const [direction, setDirection] = useState<Direction>('long');
  const [venue, setVenue] = useState(last?.venueLabel ?? '');
  const [venueTyping, setVenueTyping] = useState(false);
  const [openTime, setOpenTime] = useState(now);
  const [entry, setEntry] = useState<string | null>(null);
  const kind = kindOf(symbol);
  const cs = contractSizeFor(symbol.trim().toUpperCase(), mt).size;
  const [sizeMode, setSizeMode] = useState<SizeMode>('usd');
  const [sizeVal, setSizeVal] = useState('');
  const [closed, setClosed] = useState(false);
  const [closeTime, setCloseTime] = useState(now);
  const [closeBy, setCloseBy] = useState<'price' | 'pnl'>('price');
  const [exit, setExit] = useState<string | null>(null);
  const [pnl, setPnl] = useState('');
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
  const x = closed ? (closeBy === 'pnl' ? (e && units && parseNum(pnl) !== null ? exitFromPnl(e, units, parseNum(pnl)!, direction) : null) : parseNum(exitStr)) : null;
  const gross = closed && e && x && units ? (x - e) * units * (direction === 'long' ? 1 : -1) : null;

  const pickSymbol = (s: string) => { setSymbol(s); setEntry(null); setExit(null); if (kindOf(s) === 'mt' && sizeMode === 'units') setSizeMode('lots'); };

  async function submit() {
    setErr(null);
    const sym = symbol.trim().toUpperCase();
    if (!sym) return setErr('نماد را انتخاب کنید.');
    if (!e || e <= 0) return setErr('قیمت ورود معلوم نیست؛ از «قیمت بازار» پر کنید یا بنویسید.');
    if (!units) return setErr(sizeMode === 'lots' && !cs ? 'اندازهٔ هر لات این نماد معلوم نیست؛ اندازه را به دلار بنویسید.' : 'اندازهٔ معامله را بنویسید.');
    if (closed && closeTime < openTime) return setErr('زمان خروج باید بعد از ورود باشد.');
    if (closed && !x) return setErr(closeBy === 'pnl' ? 'سود/زیان را بنویسید.' : 'قیمت خروج معلوم نیست.');
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

  const footer = (
    <div className="space-y-2">
      {(units || gross !== null) && (
        <p className="text-xs text-muted">
          {units && e ? <>ارزش {usd(units * e)} · {fa(units, 4)} واحد</> : null}
          {gross !== null && <> · سود/زیان <b className={pnlTone(gross)}>{usd(gross, true)}</b></>}
        </p>
      )}
      {err && <p className="text-xs text-negative">{err}</p>}
      <Button size="lg" className="w-full" icon={<Check />} loading={busy} onClick={() => void submit()}>ثبت معامله</Button>
    </div>
  );

  return (
    <Sheet open onClose={onClose} title="ثبت دستی معامله" description="برای صرافی یا حسابی که وصل نیست. هرچه را نمی‌دانید خالی بگذارید یا از قیمت بازار پر کنید." size="lg" footer={footer}>
      <div className="space-y-5 text-sm">
        <SymbolPicker value={symbol} onChange={pickSymbol} options={symbols} />
        <DirectionPicker value={direction} onChange={setDirection} />

        <div className="grid gap-4 sm:grid-cols-2">
          <WhenPicker label="کی وارد شدید؟" value={openTime} onChange={(t) => { setOpenTime(t); setEntry(null); }} now={now} />
          <NumInput
            label="قیمت ورود"
            value={entryStr}
            onChange={setEntry}
            placeholder={market.coin ? 'در حال دریافت قیمت…' : 'قیمت را بنویسید'}
            fill={entry !== null && autoEntry ? () => setEntry(null) : null}
            fillLabel="قیمت بازار همان لحظه"
          />
        </div>
        {entry === null && autoEntry && <p className="-mt-3 text-[11px] text-subtle">قیمت از بازار همان لحظه پر شد (هایپرلیکوئید)؛ اگر قیمت شما فرق داشت، عوضش کنید.</p>}

        <div>
          <Label aside={
            <div className="flex gap-1" role="radiogroup" aria-label="واحد اندازه">
              {sizeModes.map((m) => <button key={m.v} type="button" role="radio" aria-checked={sizeMode === m.v} onClick={() => setSizeMode(m.v)} className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', sizeMode === m.v ? 'bg-accent-soft text-accent' : 'text-muted')}>{m.label}</button>)}
            </div>
          }>چقدر؟</Label>
          <Input inputMode="decimal" dir="ltr" aria-label="اندازه" suffix={sizeMode === 'usd' ? '$' : sizeMode === 'lots' ? 'لات' : symbol.toUpperCase().slice(0, 5)} placeholder={sizeMode === 'usd' ? 'ارزش پوزیشن (حاشیه × اهرم)' : ''} value={sizeVal} onChange={(ev) => setSizeVal(ev.target.value)} />
          {sizeMode === 'usd' && <p className="mt-1 text-[11px] text-subtle">مثلاً ۱۰۰ دلار حاشیه با اهرم ۱۰ = ۱٬۰۰۰ دلار.</p>}
          {sizeMode === 'lots' && !cs && <p className="mt-1 text-[11px] text-warn">اندازهٔ هر لات این نماد معلوم نیست؛ دلاری وارد کنید.</p>}
        </div>

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
              <NumInput label="سود یا زیان (دلار، زیان با منفی)" value={pnl} onChange={setPnl} placeholder="مثلاً 42 یا -15" suffix="$" />
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
