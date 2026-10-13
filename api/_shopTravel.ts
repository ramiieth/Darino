/** Travel sources: MrBilit flights and trains, Otaghak stays. Public read-only searches; Rial → Toman where needed. */
import { arr, obj, str } from '../src/features/connected/domain/model.js';
import type { CityRef, ShopItem } from '../src/features/shopping/domain/types.js';
import { item } from './_shopGoods.js';
import { json, mapLink, num, request, safeUrl } from './_shopHttp.js';

export interface TripQuery { origin: CityRef; destination: CityRef; date: string | null; sort: 'best' | 'cheapest'; today: string }
export interface StayQuery { cities: CityRef[]; date: string | null; nights: number; guests: number; maxPrice: number | null; minPrice: number | null; sort: 'best' | 'cheapest'; today: string }

const DAY = 86_400_000;
const addDays = (isoDate: string, n: number) => new Date(Date.parse(`${isoDate}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const toman = (rial: unknown) => { const r = num(rial); return r && r > 0 ? Math.round(r / 10) : null; };
const hhmm = (t: string) => /T(\d{2}:\d{2})/.exec(t)?.[1] ?? '';
const faDate = (isoDate: string) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${isoDate}T00:00:00Z`));

/** No date given: pick the cheapest (or, for «best», the earliest) day with a known fare in the next two weeks. */
function pickDay(days: { date: string; toman: number }[], sort: 'best' | 'cheapest'): string | null {
  if (!days.length) return null;
  const sorted = [...days].sort((a, b) => (sort === 'cheapest' ? a.toman - b.toman : 0) || a.date.localeCompare(b.date));
  return sorted[0].date;
}

export async function flights(q: TripQuery): Promise<ShopItem[]> {
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
    const leg = obj(arr(obj(arr(f.Segments)[0]).Legs)[0]);
    const offers = arr(f.Prices).map(obj).map((p) => ({ p, fare: toman(obj(arr(p.PassengerFares).map(obj).find((x) => x.PaxType === 'ADL')).TotalFare) })).filter((x) => x.fare);
    const best = offers.sort((a, b) => (a.fare ?? 0) - (b.fare ?? 0))[0];
    if (!best || !str(leg.DepartureTime)) return [];
    const airline = obj(leg.Airline);
    const seats = num(best.p.Capacity);
    return [item({
      id: `mbf-${str(f.Id)}`, service: 'mrbilit', title: `پرواز ${str(leg.Origin) || q.origin.name} ← ${str(leg.Destination) || q.destination.name}`,
      summary: `${str(airline.PersianTitle)} · ${faDate(date!)} · ${hhmm(str(leg.DepartureTime))} تا ${hhmm(str(leg.ArrivalTime))}`,
      image: safeUrl(airline.Logo), url, priceToman: best.fare, location: `${q.origin.name} → ${q.destination.name}`,
      available: seats == null || seats > 0, soonDays: daysBetween(q.today, date!),
      facts: [
        { label: 'کلاس', value: str(best.p.CabinClassDisplayName) || 'اکونومی' },
        ...(best.p.IsCharter === true ? [{ label: 'نوع', value: 'چارتری' }] : []),
        ...(num(best.p.Baggage) ? [{ label: 'بار', value: `${num(best.p.Baggage)} کیلو` }] : []),
        ...(seats != null && seats < 9 ? [{ label: 'صندلی', value: `${seats} عدد` }] : [])
      ]
    })];
  });
}

export async function trains(q: TripQuery): Promise<ShopItem[]> {
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
    if (!c) return [];
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
