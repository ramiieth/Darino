/** Travel sources: MrBilit flights and trains, Otaghak stays. Public read-only searches; Rial → Toman where needed. */
import { arr, obj, str } from '../src/features/connected/domain/model.js';
import type { CityRef, ShopItem } from '../src/features/shopping/domain/types.js';
import { item } from './_shopGoods.js';
import { json, mapLink, num, request, safeUrl } from './_shopHttp.js';

export interface TripQuery { origin: CityRef; destination: CityRef; date: string | null; sort: 'best' | 'cheapest'; today: string; vipOnly?: boolean }
export interface StayQuery { cities: CityRef[]; date: string | null; nights: number; guests: number; maxPrice: number | null; minPrice: number | null; sort: 'best' | 'cheapest'; today: string }

const DAY = 86_400_000;
const addDays = (isoDate: string, n: number) => new Date(Date.parse(`${isoDate}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
/** لوگوی ایرلاین با کد IATA (CDN مستربلیط از خارج از ایران در دسترس نیست) */
const airlineLogo = (code: string) => (/^[A-Z0-9]{2,3}$/.test(code) ? `https://cdn.alibaba.ir/static/img/airlines/Domestic/${code}.png` : null);
const toman = (rial: unknown) => { const r = num(rial); return r && r > 0 ? Math.round(r / 10) : null; };
const hhmm = (t: string) => /T(\d{2}:\d{2})/.exec(t)?.[1] ?? '';
/** زمان حرکت به میلی‌ثانیه؛ زمان بدون منطقه، ساعت تهران است */
const departsAt = (t: string) => Date.parse(/[+-]\d\d:\d\d$|Z$/.test(t) ? t : `${t}+03:30`);
/** امروز: فقط حرکت‌هایی که دست‌کم ۴۵ دقیقهٔ دیگرند */
const notDeparted = (t: string) => !(departsAt(t) < Date.now() + 45 * 60_000);
const faDate = (isoDate: string) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${isoDate}T00:00:00Z`));

/** No date given: pick the cheapest (or, for «best», the earliest) day with a known fare in the next two weeks. */
function pickDay(days: { date: string; toman: number }[], sort: 'best' | 'cheapest'): string | null {
  if (!days.length) return null;
  const sorted = [...days].sort((a, b) => (sort === 'cheapest' ? a.toman - b.toman : 0) || a.date.localeCompare(b.date));
  return sorted[0].date;
}

async function flightsOn(q: TripQuery): Promise<ShopItem[]> {
  const o = q.origin.iata; const d = q.destination.iata;
  if (!o || !d || o === d) return [];
  let date = q.date;
  if (!date) {
    const rows = arr(await request('https://flight.atighgasht.com/api/Flights/MinPrices', {
      method: 'POST', body: { AdultCount: 1, ChildCount: 0, InfantCount: 0, Origin: o, Destination: d, StartDate: `${addDays(q.today, 1)}T00:00:00`, EndDate: `${addDays(q.today, 14)}T00:00:00` }
    })).map(obj);
    date = pickDay(rows.map((r) => ({ date: str(r.Date).slice(0, 10), toman: toman(r.TotalFare) ?? 0 })).filter((r) => r.toman > 0 && /^\d{4}-\d\d-\d\d$/.test(r.date)), q.sort);
    if (!date) return [];
  }
  const body = await json('https://flight.atighgasht.com/api/Flights', {
    method: 'POST',
    body: { AdultCount: 1, ChildCount: 0, InfantCount: 0, CabinClass: 'All', Baggage: true, IncludeFlightsWithHigherCapacity: false, Routes: [{ OriginCode: o, DestinationCode: d, DepartureDate: date }] }
  });
  const url = `https://mrbilit.com/flights/${o}-${d}?departureDate=${date}`;
  return arr(body.Flights).map(obj).flatMap((f) => {
    const legs = arr(obj(arr(f.Segments)[0]).Legs).map(obj);
    const leg = legs[0] ?? {};
    const last = legs[legs.length - 1] ?? leg;
    const stops = legs.slice(0, -1).map((l) => str(l.Destination)).filter(Boolean);
    const offers = arr(f.Prices).map(obj).map((p) => ({ p, fare: toman(obj(arr(p.PassengerFares).map(obj).find((x) => x.PaxType === 'ADL')).TotalFare) })).filter((x) => x.fare);
    const best = offers.sort((a, b) => (a.fare ?? 0) - (b.fare ?? 0))[0];
    if (!best || !str(leg.DepartureTime) || !notDeparted(str(leg.DepartureTime))) return [];
    const airline = obj(leg.Airline);
    const seats = num(best.p.Capacity);
    return [item({
      id: `mbf-${str(f.Id)}`, service: 'mrbilit', title: `پرواز ${q.origin.name} ← ${q.destination.name}`,
      summary: `${str(airline.PersianTitle)} · ${faDate(date!)} · ${hhmm(str(leg.DepartureTime))} تا ${hhmm(str(last.ArrivalTime))}`,
      image: airlineLogo(str(airline.IataCode)) ?? safeUrl(airline.Logo), url, priceToman: best.fare, location: `${q.origin.name} → ${q.destination.name}`,
      available: seats == null || seats > 0, soonDays: daysBetween(q.today, date!),
      facts: [
        { label: 'کلاس', value: str(best.p.CabinClassDisplayName) || 'اکونومی' },
        ...(stops.length ? [{ label: 'توقف', value: stops.join('، ') }] : [{ label: 'مسیر', value: 'مستقیم' }]),
        ...(best.p.IsCharter === true ? [{ label: 'نوع', value: 'چارتری' }] : []),
        ...(num(best.p.Baggage) ? [{ label: 'بار', value: `${num(best.p.Baggage)} کیلو` }] : []),
        ...(seats != null && seats < 9 ? [{ label: 'صندلی', value: `${seats} عدد` }] : [])
      ]
    })];
  });
}

async function trainsOn(q: TripQuery): Promise<ShopItem[]> {
  const from = q.origin.trainId; const to = q.destination.trainId;
  if (!from || !to || from === to) return [];
  let date = q.date;
  if (!date) {
    const map = obj(await request(`https://train.mrbilit.com/api/GetMinPrices?From=${from}&To=${to}&FromDate=${addDays(q.today, 1)}&ToDate=${addDays(q.today, 14)}&Capacity=1&GenderCode=3`));
    date = pickDay(Object.entries(map).map(([k, v]) => ({ date: k.slice(0, 10), toman: toman(v) ?? 0 })).filter((r) => r.toman > 0 && /^\d{4}-\d\d-\d\d$/.test(r.date)), q.sort);
    if (!date) return [];
  }
  const qs = new URLSearchParams({ from: String(from), to: String(to), date, genderCode: '3', adultCount: '1', childCount: '0', infantCount: '0', exclusive: 'false', availableStatus: 'Both' });
  const body = await json(`https://train.mrbilit.com/api/GetAvailable/v2?${qs}`);
  const url = `https://mrbilit.com/trains/${q.origin.slug}-${q.destination.slug}`;
  return arr(body.trains).map(obj).flatMap((t) => {
    const classes = arr(t.prices).map(obj).flatMap((p) => arr(p.classes).map(obj)).filter((c) => (num(c.capacity) ?? 0) > 0 && toman(c.price));
    const c = classes.sort((a, b) => (toman(a.price) ?? 0) - (toman(b.price) ?? 0))[0];
    if (!c || !notDeparted(str(t.departureTime))) return [];
    return [item({
      id: `mbt-${str(t.id)}-${str(c.id)}`, service: 'mrbilit', title: `قطار ${q.origin.name} ← ${q.destination.name}`,
      summary: `${str(t.corporationName)} · ${faDate(date!)} · ${hhmm(str(t.departureTime))} تا ${hhmm(str(t.arrivalTime))}`,
      url, priceToman: toman(c.price), location: `${q.origin.name} → ${q.destination.name}`, soonDays: daysBetween(q.today, date!),
      facts: [{ label: 'واگن', value: str(c.wagonName).trim() || str(c.class) }, { label: 'صندلی', value: `${num(c.capacity)} عدد` }]
    })];
  });
}

const cityCodes = new Map<string, string | null>();

async function otaghakCity(c: CityRef): Promise<string | null> {
  if (cityCodes.has(c.name)) return cityCodes.get(c.name)!;
  const rows = arr(await request(`https://core.otaghak.com/api/v1/Search/GetSearchResult?input=${encodeURIComponent(c.name)}`)).map(obj);
  const code = str(rows.find((r) => r.typeCode === 'city' && str(r.name) === c.name)?.cityCode ?? rows.find((r) => r.typeCode === 'city')?.cityCode) || null;
  cityCodes.set(c.name, code && /^[a-z0-9-]{2,40}$/.test(code) ? code : null);
  return cityCodes.get(c.name)!;
}

export async function otaghak(q: StayQuery): Promise<ShopItem[]> {
  const codes = (await Promise.all(q.cities.slice(0, 7).map(otaghakCity))).filter((c): c is string => !!c);
  if (!codes.length) return [];
  const checkIn = q.date ?? addDays(q.today, 1); const checkOut = addDays(checkIn, q.nights);
  const body = await json('https://core.otaghak.com/api/v3/RoomSearch/SearchRooms', {
    method: 'POST',
    body: {
      cities: codes, stateCodes: [], boxCode: '', sortingType: q.sort === 'cheapest' ? 'MinPricePriority' : 'OtaghakSuggestions',
      checkIn, checkOut, person: q.guests, minPrice: q.minPrice, maxPrice: q.maxPrice, type: [], rentTypes: [], aroundLocations: false, filter: '', skip: 0, take: 24
    }
  });
  return arr(body.rooms).map(obj).map((r) => {
    const perNight = num(r.afterDiscountAverage) ?? num(r.averagePrice) ?? num(r.basePrice);
    const before = num(r.averagePrice);
    const file = str(obj(r.roomMediaTitles).mainImageTitle);
    const comments = num(r.commentsCount) ?? 0;
    return item({
      id: `ot-${num(r.roomId)}`, service: 'otaghak', title: str(r.roomName).trim(), url: `https://www.otaghak.com/room/${num(r.roomId)}/?checkIn=${checkIn}&checkOut=${checkOut}`,
      image: /^[\w.-]{6,80}$/.test(file) ? `https://cdn.otaghak.com/otg-images-new/Medium/${file}` : null,
      summary: [str(r.roomTypeName), r.isInstantBook === true ? 'رزرو آنی' : ''].filter(Boolean).join(' · ') || null,
      priceToman: perNight ? Math.round(perNight) : null, priceBeforeToman: before && perNight && before > perNight ? Math.round(before) : null,
      discountPercent: before && perNight && before > perNight ? Math.round((100 * (before - perNight)) / before) : 0,
      rating: comments ? num(r.rate) : null, ratingCount: comments, location: [str(r.cityFaName), str(r.stateFaName)].filter(Boolean).join('، ') || null,
      mapUrl: mapLink(r.latitude, r.longitude),
      facts: [{ label: 'ظرفیت', value: `${num(r.personCapacity) ?? '?'} نفر` }, { label: 'قیمت', value: 'هر شب' }]
    });
  }).filter((i) => i.title && /\/room\/\d+/.test(i.url));
}

/** روز خواسته‌شده پر یا بی‌پرواز بود؟ نزدیک‌ترین روز با صندلی خالی در ۲ هفتهٔ بعد */
async function withNextDay(q: TripQuery, on: (q: TripQuery) => Promise<ShopItem[]>): Promise<ShopItem[]> {
  const first = await on(q);
  if (first.length || !q.date) return first;
  const later = await on({ ...q, date: null, sort: 'best', today: addDays(q.date, -1) });
  return later.map((i) => ({ ...i, facts: [{ label: 'توجه', value: 'روز خواسته‌شده جای خالی نداشت' }, ...i.facts] }));
}

/** شهر بدون فرودگاه یا کم‌پرواز (کرج، قم…) → نزدیک‌ترین فرودگاه پرپرواز */
async function viaNearestAirport(q: TripQuery, on: (q: TripQuery) => Promise<ShopItem[]>): Promise<ShopItem[]> {
  const direct = q.destination.iata ? await on(q) : [];
  if (direct.length || !q.destination.nearIata) return direct;
  const near = await on({ ...q, destination: { ...q.destination, iata: q.destination.nearIata } });
  return near.map((i) => ({ ...i, facts: [{ label: 'فرودگاه', value: `نزدیک‌ترین فرودگاه (${q.destination.nearIata})` }, ...i.facts] }));
}

export const flights = (q: TripQuery) => viaNearestAirport(q, (x) => withNextDay(x, flightsOn));
export const trains = (q: TripQuery) => withNextDay(q, trainsOn);

/* ---------- علی‌بابا: پرواز داخلی ---------- */

/** تاریخ میلادی → «1405-07-23» برای لینک علی‌بابا */
function jalali(isoDate: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(`${isoDate}T00:00:00Z`)).map((x) => [x.type, x.value]));
  return `${String(p.year).replace(/\D/g, '')}-${p.month}-${p.day}`;
}

const ALIBABA = 'https://ws.alibaba.ir/api/v1/flights/domestic/available';
const ALIBABA_HEADERS = { Origin: 'https://www.alibaba.ir', Referer: 'https://www.alibaba.ir/' };

async function alibabaOn(q: TripQuery): Promise<ShopItem[]> {
  const o = q.origin.iata; const d = q.destination.iata;
  if (!o || !d || o === d) return [];
  const date = q.date ?? addDays(q.today, 1);
  const start = obj(await request(ALIBABA, {
    method: 'POST', headers: ALIBABA_HEADERS, cacheKey: `alibaba ${o} ${d} ${date}`,
    body: { infant: 0, child: 0, adult: 1, departureDate: date, origin: o, destination: d, flightClass: 'economy' }
  }));
  const rid = str(obj(start.result).requestId);
  if (!/^[A-Z0-9]{10,200}$/.test(rid)) return [];
  let rows: Record<string, unknown>[] = [];
  for (let i = 0; i < 4; i++) {
    const r = obj(obj(await request(`${ALIBABA}/${rid}`, { headers: ALIBABA_HEADERS, cacheKey: false })).result);
    rows = arr(r.departing).map(obj);
    if (r.isCompleted === true || rows.length >= 5) break;
    await new Promise((res) => setTimeout(res, 1200));
  }
  const url = `https://www.alibaba.ir/flights/${o}-${d}?adult=1&child=0&infant=0&departing=${jalali(date)}`;
  return rows.flatMap((f) => {
    const seats = num(f.seat);
    const leave = str(f.leaveDateTime);
    if (!leave || !notDeparted(leave) || (seats != null && seats <= 0) || f.isAllowedToBuy === false) return [];
    return [item({
      id: `ab-${str(f.uniqueKey) || str(f.flightId)}`, service: 'alibaba', title: `پرواز ${q.origin.name} ← ${q.destination.name}`,
      summary: `${str(f.airlineName)} · ${faDate(leave.slice(0, 10))} · ${hhmm(leave)} تا ${hhmm(str(f.arrivalDateTime))}`,
      image: safeUrl(f.airlineLogo), url, priceToman: toman(f.priceAdult), location: `${q.origin.name} → ${q.destination.name}`,
      soonDays: daysBetween(q.today, leave.slice(0, 10)),
      facts: [
        { label: 'کلاس', value: str(f.classTypeName) || 'اکونومی' },
        { label: 'مسیر', value: f.hasConnection === true ? 'با توقف' : 'مستقیم' },
        ...(f.isCharter === true ? [{ label: 'نوع', value: 'چارتری' }] : []),
        ...(num(f.maxAllowedBaggage) ? [{ label: 'بار', value: `${num(f.maxAllowedBaggage)} کیلو` }] : []),
        ...(seats != null && seats < 9 ? [{ label: 'صندلی', value: `${seats} عدد` }] : [])
      ]
    })];
  });
}

export const alibabaFlights = (q: TripQuery) => viaNearestAirport(q, (x) => withNextDay(x, alibabaOn));

/* ---------- مستربلیط: اتوبوس ---------- */

async function busesOn(q: TripQuery, date: string): Promise<ShopItem[]> {
  const from = q.origin.busId; const to = q.destination.busId;
  if (!from || !to || from === to) return [];
  const body = await json('https://bus.mrbilit.ir/api/GetBusServices', {
    method: 'POST', timeoutMs: 20_000, body: { from, to, date, includeClosed: false, includePromotions: true, loadFromDbOnUnavailability: true, includeUnderDevelopment: false }
  });
  return arr(body.buses).map(obj).flatMap((b) => {
    const seats = num(b.capacity) ?? 0;
    const dep = str(b.departureTime);
    if (seats <= 0 || !dep || !notDeparted(dep)) return [];
    if (q.vipOnly && b.isVIP !== true && !/vip/i.test(str(b.busType))) return [];
    const price = toman((num(b.price) ?? 0) - (num(b.discount) ?? 0));
    return [item({
      id: `mbb-${str(b.id)}-${str(b.superCorporationID)}-${dep}-${price}`, service: 'mrbilit', title: `اتوبوس ${q.origin.name} ← ${q.destination.name}`,
      summary: `${str(b.superCorporation).trim() || str(b.corporation).trim()} · ${faDate(date)} · ${hhmm(dep)}`,
      url: 'https://mrbilit.com/buses', priceToman: price, location: `${q.origin.name} → ${q.destination.name}`, soonDays: daysBetween(q.today, date),
      facts: [
        { label: 'اتوبوس', value: str(b.busType).trim() || (b.isVIP === true ? 'VIP' : 'معمولی') },
        { label: 'صندلی', value: `${seats} عدد` },
        ...(str(b.toName) ? [{ label: 'پایانه', value: str(b.toName) }] : [])
      ]
    })];
  });
}

export async function buses(q: TripQuery): Promise<ShopItem[]> {
  const day = q.date ?? q.today;
  const first = await busesOn(q, day);
  if (first.length) return first;
  const next = await busesOn(q, addDays(day, 1));
  return next.map((i) => ({ ...i, facts: [{ label: 'توجه', value: q.date ? 'روز خواسته‌شده جای خالی نداشت' : 'امروز جای خالی نبود' }, ...i.facts] }));
}

/* ---------- جاباما تورز: تور گروهی ---------- */

export interface TourQuery { destination: CityRef | null; keywords: string; sort: 'best' | 'cheapest'; maxPrice: number | null; today: string }

const tourPlaces = new Map<string, number | null>();

async function tourPlace(name: string): Promise<number | null> {
  if (tourPlaces.has(name)) return tourPlaces.get(name)!;
  const rows = arr(obj(await request(`https://api.jabama.tours/api/v1/locations/search?q=${encodeURIComponent(name)}&direction=destination&limit=5`)).data).map(obj);
  const hit = rows.find((r) => str(r.name) === name) ?? rows[0];
  const id = num(hit?.id);
  tourPlaces.set(name, id && id > 0 ? id : null);
  return tourPlaces.get(name)!;
}

const isImage = (u: unknown) => typeof u === 'string' && /\.(webp|jpe?g|png)(\?|$)/i.test(u);

export async function tours(q: TourQuery): Promise<ShopItem[]> {
  const qs = new URLSearchParams({ page: '1', per_page: '20', available_only: 'true', sort_by: q.sort === 'cheapest' ? 'price' : 'recommended', sort_order: q.sort === 'cheapest' ? 'asc' : 'desc', min_price: '300000' });
  if (q.maxPrice) qs.set('max_price', String(q.maxPrice));
  if (q.destination) {
    const id = await tourPlace(q.destination.name);
    if (id) qs.set('destination_location_ids', String(id)); else qs.set('search', q.destination.name);
  } else if (q.keywords) qs.set('search', q.keywords);
  const data = await json(`https://api.jabama.tours/api/v1/tours?${qs}`);
  return arr(data.data).map(obj).map((t) => {
    const price = obj(t.price); const loc = obj(t.location); const rv = obj(t.reviews);
    const amount = num(price.discounted_price) ?? num(price.amount);
    const before = num(price.discounted_price) ? num(price.amount) : null;
    const thumb = obj(t.thumbnail);
    const image = [thumb.thumbnail_url, thumb.poster_url, isImage(thumb.url) ? thumb.url : null, ...arr(t.gallery).map(obj).map((g) => g.url)].find(isImage);
    const next = obj(arr(t.departure_dates)[0]);
    const nextDate = /^\d{4}-\d\d-\d\d$/.test(str(next.date)) ? str(next.date) : null;
    const count = num(rv.count) ?? 0;
    const id = str(t.public_id);
    return item({
      id: `jt-${id}`, service: 'jabama', title: str(t.title).trim(), url: /^\d{4,12}$/.test(id) ? `https://jabama.tours/tour/${id}` : '',
      image: safeUrl(image), summary: [str(obj(t.duration).formatted), str(obj(t.operator).name)].filter(Boolean).join(' · ') || null,
      priceToman: amount, priceBeforeToman: before && amount && before > amount ? before : null,
      discountPercent: Math.round(num(price.discount_percent) ?? 0),
      rating: count ? num(rv.rating_avg) : null, ratingCount: count,
      location: [str(obj(loc.origin).name) && `از ${str(obj(loc.origin).name)}`, arr(loc.destinations).map(obj).map((d) => str(d.name)).filter(Boolean).join('، ')].filter(Boolean).join(' به ') || null,
      soonDays: nextDate ? daysBetween(q.today, nextDate) : null,
      facts: [
        ...(nextDate ? [{ label: 'حرکت', value: faDate(nextDate) }] : []),
        ...(str(t.transportation) ? [{ label: 'سفر', value: str(t.transportation) }] : []),
        ...(str(t.accommodation_type) ? [{ label: 'اقامت', value: str(t.accommodation_type) }] : []),
        ...(num(t.available_seats) ? [{ label: 'ظرفیت', value: `${num(t.available_seats)} نفر` }] : []),
        { label: 'قیمت', value: 'هر نفر' }
      ]
    });
  }).filter((i) => i.title && i.url);
}

/* ---------- مستربلیط: تاکسی بین‌شهری دربست ---------- */

/** هر کلاس خودرو (اکونومی، VIP، تشریفات) دو زمان سوار شدن نزدیک؛ قیمت برای کل خودرو (تا ۳ نفر) */
async function taxisOn(q: TripQuery, date: string): Promise<ShopItem[]> {
  const from = q.origin.taxiSlug && q.origin.busId; const to = q.destination.taxiSlug && q.destination.busId;
  if (!from || !to || from === to) return [];
  const body = await json('https://bus.mrbilit.ir/api/GetTaxiServices', {
    method: 'POST', timeoutMs: 20_000, body: { from, to, date, includeClosed: false, includePromotions: true, loadFromDbOnUnavailability: true, includeUnderDevelopment: false }
  });
  const perClass = new Map<string, number>();
  const url = `https://mrbilit.com/taxi/${q.origin.taxiSlug}-${q.destination.taxiSlug}?departureDate=${jalali(date)}`;
  return arr(body.buses).map(obj).flatMap((b) => {
    const cls = str(b.superCorporation).trim() || 'تاکسی';
    const pickup = str(b.departureTime);
    if (!pickup || !notDeparted(pickup) || (num(b.capacity) ?? 0) <= 0) return [];
    const n = perClass.get(cls) ?? 0;
    if (n >= 2) return [];
    perClass.set(cls, n + 1);
    return [item({
      id: `mbx-${str(b.id)}-${cls}-${pickup}`, service: 'mrbilit', title: `تاکسی دربست ${q.origin.name} ← ${q.destination.name}`,
      summary: `${cls} · ${faDate(date)} · سوار شدن ${hhmm(pickup)}`, url, priceToman: toman(b.price),
      location: `${q.origin.name} → ${q.destination.name}`, soonDays: daysBetween(q.today, date),
      facts: [{ label: 'خودرو', value: str(b.busType).trim() || cls }, { label: 'ظرفیت', value: `تا ${num(b.capacity)} نفر` }, { label: 'قیمت', value: 'کل خودرو' }]
    })];
  });
}

export async function taxis(q: TripQuery): Promise<ShopItem[]> {
  const day = q.date ?? q.today;
  const first = await taxisOn(q, day);
  if (first.length) return first;
  const next = await taxisOn(q, addDays(day, 1));
  return next.map((i) => ({ ...i, facts: [{ label: 'توجه', value: q.date ? 'روز خواسته‌شده جای خالی نداشت' : 'امروز جای خالی نبود' }, ...i.facts] }));
}
