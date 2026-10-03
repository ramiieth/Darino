import { useState } from 'react';
import { BookOpen, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Input } from '@/shared/components/ui/Input';
import { Disclosure } from '@/shared/components/ui/Disclosure';
export const BOROS_TERMS = [
 ['نرخ‌ها','نرخ سالانه','APR','نمایش سالانهٔ نرخ؛ سود کل دوره به مدت نگهداری و هزینه‌ها وابسته است.'],
 ['نرخ‌ها','نرخ ضمنی','Implied APR','نرخی که بازار برای جریان بازده قیمت‌گذاری کرده؛ نرخ اجرای سفارش می‌تواند متفاوت باشد.'],
 ['نرخ‌ها','نرخ مرجع','Mark APR','مرجع ارزش‌گذاری پوزیشن و محاسبهٔ ریسک؛ قیمت قطعی ورود نیست.'],
 ['نرخ‌ها','نرخ پایهٔ شناور','Underlying APR','فاندینگ منبع اصلی؛ با گذشت زمان تغییر می‌کند.'],
 ['نرخ‌ها','نرخ ثابت ورود','Fixed APR','نرخ اجرای پوزیشن که در برابر جریان شناور پرداخت یا دریافت می‌کنید.'],
 ['نرخ‌ها','میانگین نرخ پایه','Underlying APR MA','میانگین گذشتهٔ نرخ پایه؛ پیش‌بینی آینده نیست.'],
 ['حجم و ریسک','واحد بازده','Yield Unit · YU','قرارداد جریان بازده یک واحد از دارایی وثیقه؛ خرید یک واحد رمزارز نیست.'],
 ['حجم و ریسک','حجم قرارداد','Notional Size','تعداد واحدهای بازده؛ با موجودی وثیقه یا سرمایه دلاری فرق دارد.'],
 ['حجم و ریسک','حساسیت نرخ','Rate Sensitivity','تغییر تقریبی ارزش پوزیشن برای حرکت یک واحد درصد در نرخ ضمنی.'],
 ['حجم و ریسک','نوسان روزانه','Daily Volatility','معیار نوسان اخیر نرخ؛ دامنهٔ زیان تضمین‌شده نیست.'],
 ['حجم و ریسک','وثیقه','Collateral','دارایی سپرده‌شده برای پشتوانهٔ پوزیشن.'],
 ['حجم و ریسک','ارزش خالص حساب','Net Balance','وثیقه به‌علاوهٔ سود یا زیان تحقق‌نیافته.'],
 ['حجم و ریسک','مارجین لازم','Margin Required','وثیقهٔ موردنیاز برای نگهداری حجم انتخابی.'],
 ['حجم و ریسک','مارجین آزاد','Available Margin','بخش قابل استفاده برای پوزیشن جدید؛ کل سرمایه نیست.'],
 ['حجم و ریسک','مارجین نگهداری','Maintenance Margin','حداقل ارزش خالص لازم برای حفظ پوزیشن.'],
 ['حجم و ریسک','نرخ لیکوییدشدن','Liquidation Implied APR','آستانهٔ نرخ ضمنی، نه قیمت رمزارز؛ با تسویه و وضعیت حساب تغییر می‌کند.'],
 ['حجم و ریسک','مارجین مشترک','Cross Margin','پوزیشن‌های دارای وثیقهٔ یکسان از پشتوانهٔ مشترک استفاده می‌کنند.'],
 ['حجم و ریسک','مارجین جدا','Isolated Margin','وثیقهٔ مخصوص یک بازار، جدا از سایر پوزیشن‌ها.'],
 ['سفارش و هزینه','لانگ نرخ','Long Rates','نرخ ثابت می‌پردازید و نرخ شناور دریافت می‌کنید.'],
 ['سفارش و هزینه','شورت نرخ','Short Rates','نرخ شناور می‌پردازید و نرخ ثابت دریافت می‌کنید.'],
 ['سفارش و هزینه','سفارش فوری','Market Order','اجرای فوری با نرخ‌های موجود؛ نرخ نهایی تابع عمق بازار است.'],
 ['سفارش و هزینه','سفارش محدود','Limit Order','اجرا در نرخ انتخابی یا بهتر؛ پرشدن سفارش قطعی نیست.'],
 ['سفارش و هزینه','دفتر سفارش','Orderbook','نرخ‌ها و حجم‌های آمادهٔ معامله؛ با اندازهٔ سفارش روی اجرا اثر می‌گذارد.'],
 ['سفارش و هزینه','اختلاف نرخ خرید و فروش','Spread','فاصلهٔ بهترین نرخ دو سمت دفتر سفارش.'],
 ['سفارش و هزینه','لغزش نرخ','Slippage','تفاوت نرخ مرجع و اجرا؛ حد لغزش، محدودیت سفارش است.'],
 ['سفارش و هزینه','اثر سفارش','Price Impact','تغییر نرخ اجرای سفارش به دلیل حجم و عمق بازار.'],
 ['سفارش و هزینه','کارمزد اجرا','Taker Fee','هزینهٔ مصرف نقدشوندگی دفتر سفارش؛ جدا از گس.'],
 ['سفارش و هزینه','کارمزد تسویه','Settlement Fee','هزینهٔ دوره‌ای پوزیشن باز.'],
 ['سفارش و هزینه','هزینهٔ ورود بازار','Market Entrance Fee','هزینهٔ اولین تعامل با بازار؛ مقدار را از حساب واقعی بررسی کنید.'],
 ['سفارش و هزینه','هزینهٔ شبکه','Gas','هزینهٔ تراکنش؛ با کارمزد معامله فرق دارد.'],
 ['سفارش و هزینه','مشوق سفارش','Incentives','پاداش با شرایط خاص؛ در سود سناریو تضمین نمی‌شود.'],
 ['سفارش و هزینه','اجرای کامل یا لغو','Fill or Kill · FOK','تمام حجم در محدودهٔ مجاز اجرا می‌شود یا سفارش انجام نمی‌شود.'],
 ['سود و دوره','تسویه فاندینگ','Settlement','اختلاف نرخ ثابت و پایه در دوره‌های تسویه به وثیقه اعمال می‌شود.'],
 ['سود و دوره','سررسید','Maturity','پایان دورهٔ قرارداد.'],
 ['سود و دوره','سود و زیان','PnL','نتیجهٔ پوزیشن؛ سود تسویه و تغییر ارزش بازار را جدا بررسی کنید.'],
 ['سود و دوره','سود تحقق‌نیافته','Unrealized PnL','تغییر ارزش پوزیشن باز، هنوز نتیجهٔ قطعی خروج نیست.'],
 ['سود و دوره','سود تحقق‌یافته','Realized PnL','نتیجهٔ ثبت‌شدهٔ معاملات بسته‌شده؛ با فاندینگ تسویه‌شده فرق دارد.'],
 ['سود و دوره','ارزش قراردادهای باز','Notional OI','حجم قراردادهای باز بازار؛ ظرفیت قطعی اجرای سفارش شما نیست.'],
 ['سود و دوره','حجم روزانه','24h Volume','حجم معاملات اخیر بازار؛ تضمین نقدشوندگی نیست.'],
 ['سود و دوره','محدود به پوزیشن','Cap to Position','محدودکردن سفارش به اندازهٔ پوزیشن موجود، معمولاً برای کاهش یا بستن آن.']
] as const;
export function BorosGuide(){
 const [query,setQuery]=useState('');const text=query.trim().toLowerCase();
 return <div className="space-y-4" dir="rtl">
  <Surface variant="focal" className="p-4 md:p-5 space-y-3"><div className="flex items-center gap-2 text-brand-500"><BookOpen size={19}/><h2 className="text-base font-bold">راهنمای بوروس</h2></div><p className="text-sm leading-7">در بوروس، نرخ فاندینگ را معامله می‌کنید. دارینو برای بررسی حساب و پیش‌نمایش است؛ سفارش را در خود بوروس باز می‌کنید.</p><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-positive/10 p-3"><h3 className="flex items-center gap-2 text-positive font-bold text-sm"><ArrowUpRight size={17}/>لانگ نرخ <bdi dir="ltr" className="text-xs font-normal">Long Rates</bdi></h3><p className="text-xs leading-6 mt-2">پرداخت ثابت ← دریافت شناور. بالاتر بودن میانگین نرخ پایه از نرخ ورود، به تسویهٔ لانگ کمک می‌کند؛ حرکت مارک هم بر ارزش پوزیشن اثر دارد.</p></div><div className="rounded-xl bg-brand-500/10 p-3"><h3 className="flex items-center gap-2 text-brand-500 font-bold text-sm"><ArrowDownRight size={17}/>شورت نرخ <bdi dir="ltr" className="text-xs font-normal">Short Rates</bdi></h3><p className="text-xs leading-6 mt-2">پرداخت شناور ← دریافت ثابت. پایین‌تر بودن میانگین نرخ پایه از نرخ ورود، به تسویهٔ شورت کمک می‌کند؛ هزینه و ریسک باقی می‌مانند.</p></div></div></Surface>
  <Surface className="p-4 md:p-5"><h3 className="text-sm font-bold mb-3">از انتخاب بازار تا بررسی ورود</h3><ol className="space-y-3 text-sm leading-7 list-decimal list-inside marker:text-brand-500"><li>در «حساب من»، آدرس و شمارهٔ حساب و موجودی وثیقه را بررسی کنید.</li><li>در «بازارها»، دارایی، پلتفرم و سررسید مناسب را انتخاب کنید.</li><li>در «پیش‌نمایش»، حساب واقعی یا سرمایهٔ فرضی و جهت نرخ را مشخص کنید.</li><li>حجم را برحسب واحد بازده وارد کنید؛ سپس نرخ اجرا، مارجین و لیکوییدشدن را از پیش‌نمایش رسمی بخوانید.</li><li>برای سود خالص، گس و هزینه‌ها و فرض نرخ پایه را وارد کنید؛ عدد پیش‌نمایش، سود قطعی آینده نیست.</li></ol></Surface>
  <Surface className="p-4 md:p-5 space-y-4"><Input aria-label="جست‌وجوی اصطلاح بوروس" placeholder="جست‌وجوی اصطلاح فارسی یا انگلیسی" value={query} onChange={e=>setQuery(e.target.value)}/>{['نرخ‌ها','حجم و ریسک','سفارش و هزینه','سود و دوره'].map(group=>{const rows=BOROS_TERMS.filter(t=>t[0]===group&&t.join(' ').toLowerCase().includes(text));return rows.length?<Disclosure key={group+!!text} summary={group} defaultOpen={!!text}><div className="grid gap-2 py-3 md:grid-cols-2">{rows.map(t=><article key={t[2]} className="rounded-xl bg-surface-2 p-3 min-w-0"><h4 className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-semibold"><span>{t[1]}</span><bdi dir="ltr" className="text-xs text-brand-500 font-medium break-words">{t[2]}</bdi></h4><p className="mt-2 text-xs leading-6 text-muted">{t[3]}</p></article>)}</div></Disclosure>:null;})}{!BOROS_TERMS.some(t=>t.join(' ').toLowerCase().includes(text))&&<p className="text-sm text-muted">اصطلاحی پیدا نشد.</p>}</Surface>
  <Disclosure summary="مستندات رسمی"><div className="flex flex-wrap gap-3 py-3 text-xs text-brand-500">{[['معرفی بوروس','Introduction'],['دفتر سفارش','boros-systems/orderbook'],['مارجین و لیکوییدشدن','boros-systems/margin-and-liquidations'],['کارمزدها','boros-systems/fees']].map(([name,path])=><a key={path} href={'https://docs.pendle.finance/boros-docs/'+path} target="_blank" rel="noreferrer">{name}</a>)}</div></Disclosure>
 </div>;
}
