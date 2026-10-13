/** Doctor search on Paziresh24 and Doctoreto: public listings, satisfaction, first free slot. Nothing is booked. */
import { arr, obj, str } from '../src/features/connected/domain/model.js';
import { parseDate, tehranToday } from '../src/features/shopping/domain/intent.js';
import type { CityRef, ShopItem } from '../src/features/shopping/domain/types.js';
import { item } from './_shopGoods.js';
import { json, mapLink, num, plain, safeUrl } from './_shopHttp.js';

export interface DoctorQuery { keywords: string; city: CityRef; now: number }

const DAY = 86_400_000;
const daysUntil = (isoDate: string | null, now: number) => (isoDate ? Math.max(0, Math.round((Date.parse(`${isoDate}T00:00:00Z`) - tehranToday(now).getTime()) / DAY)) : null);

export async function paziresh24(q: DoctorQuery): Promise<ShopItem[]> {
  const qs = new URLSearchParams({ page: '1', limit: '20' });
  if (q.keywords) qs.set('text', q.keywords);
  const data = await json(`https://apigw.paziresh24.com/seapi/v1/search/${q.city.slug}?${qs}`);
  return arr(obj(data.search).result).map(obj).filter((r) => r.type === 'doctor').map((r) => {
    const first = arr(r.actions).map(obj).map((a) => plain(str(a.top_title))).find((t) => t.includes('اولین نوبت')) ?? '';
    const firstText = first.replace(/^.*اولین نوبت:?\s*/, '').trim();
    const satisfaction = num(r.satisfaction);
    const local = arr(r.centers).map(obj).find((c) => str(c.city_name) === q.city.name && c.center_type === 1);
    const path = str(r.url);
    return item({
      id: `pz-${str(r.id)}`, service: 'paziresh24', title: `${str(r.prefix)} ${str(r.title)}`.trim(),
      url: path.startsWith('/dr/') ? `https://www.paziresh24.com${encodeURI(path)}` : '',
      image: safeUrl(r.image), summary: str(r.display_expertise).split(',')[0].trim() || null,
      rating: satisfaction != null ? Math.round(satisfaction / 2) / 10 : null, ratingCount: num(r.rates_count),
      location: local ? str(local.name) : str(r.display_address).split(',').pop()?.trim().slice(0, 60) || null,
      mapUrl: local ? mapLink(obj(local.map).lat, obj(local.map).lon) : null,
      soonDays: daysUntil(firstText ? parseDate(firstText, q.now) : null, q.now),
      facts: [
        ...(satisfaction != null ? [{ label: 'رضایت', value: `${satisfaction}٪` }] : []),
        ...(firstText ? [{ label: 'اولین نوبت', value: firstText }] : []),
        ...(str(r.waiting_time) ? [{ label: 'معطلی', value: str(r.waiting_time) }] : [])
      ]
    });
  }).filter((i) => i.url);
}

const avatar = (s: unknown) => (typeof s === 'string' && s.startsWith('s3://') ? `https://statics.doctoreto.com/rt:fit/s:300/plain/${s}` : safeUrl(s));

export async function doctoreto(q: DoctorQuery): Promise<ShopItem[]> {
  const qs = new URLSearchParams({ city_slug: q.city.slug, page: '1', per_page: '20' });
  if (q.keywords) qs.set('query', q.keywords);
  const data = await json(`https://api.doctoreto.com/api/web/patient/v1/doctors?${qs}`, { headers: { 'app-version': '2.0.0' } });
  return arr(obj(data.items).data).map(obj).map((d) => {
    const rate = obj(d.rate); const free = obj(d.free_next_consultation_time);
    const offices = arr(d.consultations).map(obj).filter((c) => obj(c.type).value === 0);
    const place = obj(offices[0]?.place);
    const fee = offices.map((c) => num(obj(c.offline_price).price)).filter((v): v is number => v != null && v > 0).sort((a, b) => a - b)[0] ?? null;
    const freeDate = /^\d{4}-\d\d-\d\d/.exec(str(free.date))?.[0] ?? null;
    const slug = str(d.slug); const id = str(d.id);
    return item({
      id: `dt-${id}`, service: 'doctoreto', title: str(d.full_name).trim(), url: /^[\w-]+$/.test(slug) && /^\w+$/.test(id) ? `https://doctoreto.com/doctor/${slug}/${id}` : '',
      image: avatar(d.avatar_url), summary: str(d.title) || null, priceToman: fee,
      rating: num(rate.percent) != null ? Math.round(num(rate.percent)! / 2) / 10 : null, ratingCount: num(rate.count),
      location: str(place.name) || null, mapUrl: mapLink(place.latitude ?? place.lat, place.longitude ?? place.lng),
      soonDays: daysUntil(freeDate, q.now),
      facts: [
        ...(num(rate.percent) != null ? [{ label: 'رضایت', value: `${num(rate.percent)}٪` }] : []),
        ...(str(free.shamsi_date) ? [{ label: 'اولین نوبت', value: str(free.shamsi_date) }] : []),
        ...(num(d.count_done_orders) ? [{ label: 'نوبت موفق', value: String(num(d.count_done_orders)) }] : [])
      ]
    });
  }).filter((i) => i.url);
}
