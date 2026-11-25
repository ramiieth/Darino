/**
 * موتور یکپارچه‌سازی قیمت زنده و رفع تناقض بین «کمیته ایجنت‌ها (کوتاه‌مدت)» و «ستاپ سوینگ (میان‌مدت)»
 *
 * قوانین کلیدی:
 *  ۱) قیمت زندهٔ واقعی (از هایپرلیکوئید یا کوین‌گکو) همیشه بر قیمت مرجع/فالبک (isReference) اولویت دارد.
 *  ۲) هر دو کارت کمیته و سوینگ دقیقاً روی یک قیمت واحد محاسبه می‌شوند تا اختلاف قیمتی رخ ندهد.
 *  ۳) اگر جهت کوتاه‌مدت کمیته با ناحیه ارزنده میان‌مدت سوینگ متفاوت باشد، به‌جای تناقض خام،
 *     حکم واحد «اختلاف تایم‌فریم» همراه با دستورالعمل شفاف مدیریت ریسک صادر می‌شود.
 */
import type { RATING_FA } from './tradingAgents';
import type { SwingOpportunity } from './swing';

export type DeskRating = keyof typeof RATING_FA;

export interface ResolvedDeskPrice {
  price: number;
  change24h: number;
  isLive: boolean;
  sourceLabelFa: string;
}

export function resolveUnifiedDeskPrice(params: {
  livePerpPrice?: number | null;
  livePerpIsReference?: boolean;
  livePerpChange24h?: number | null;
  topMarketPrice?: number | null;
  topMarketIsSnapshot?: boolean;
  topMarketChange24h?: number | null;
  curatedRefPrice?: number | null;
  curatedRefChange24h?: number | null;
}): ResolvedDeskPrice {
  const hasLivePerp =
    typeof params.livePerpPrice === 'number' &&
    Number.isFinite(params.livePerpPrice) &&
    params.livePerpPrice > 0 &&
    !params.livePerpIsReference;

  const hasLiveTop =
    typeof params.topMarketPrice === 'number' &&
    Number.isFinite(params.topMarketPrice) &&
    params.topMarketPrice > 0 &&
    !params.topMarketIsSnapshot;

  const hasAnyTop =
    typeof params.topMarketPrice === 'number' &&
    Number.isFinite(params.topMarketPrice) &&
    params.topMarketPrice > 0;

  if (hasLivePerp) {
    return {
      price: params.livePerpPrice!,
      change24h: params.livePerpChange24h ?? params.topMarketChange24h ?? 0,
      isLive: true,
      sourceLabelFa: 'قیمت زنده (پرپ)'
    };
  }

  if (hasLiveTop) {
    return {
      price: params.topMarketPrice!,
      change24h: params.topMarketChange24h ?? 0,
      isLive: true,
      sourceLabelFa: 'قیمت زنده بازار'
    };
  }

  if (hasAnyTop) {
    return {
      price: params.topMarketPrice!,
      change24h: params.topMarketChange24h ?? 0,
      isLive: false,
      sourceLabelFa: 'آخرین قیمت ذخیره‌شده'
    };
  }

  const refPrice =
    (typeof params.livePerpPrice === 'number' && params.livePerpPrice > 0 ? params.livePerpPrice : null) ??
    (typeof params.curatedRefPrice === 'number' && params.curatedRefPrice > 0 ? params.curatedRefPrice : null) ??
    100;

  return {
    price: refPrice,
    change24h: params.curatedRefChange24h ?? params.livePerpChange24h ?? 0,
    isLive: false,
    sourceLabelFa: 'قیمت مرجع (در انتظار اتصال زنده)'
  };
}

export type SignalDirection = 'long' | 'short' | 'neutral';

export interface DeskConsensusResult {
  committeeDirection: SignalDirection;
  committeeDirectionFa: string;
  swingDirection: 'long' | 'neutral';
  swingDirectionFa: string;
  alignment: 'aligned_long' | 'aligned_caution' | 'timeframe_conflict';
  tone: 'gain' | 'warn' | 'loss' | 'info';
  badgeFa: string;
  headlineFa: string;
  explanationFa: string;
  actionRuleFa: string;
}

export function directionFromCommitteeRating(rating: DeskRating): { dir: SignalDirection; labelFa: string } {
  if (rating === 'Buy' || rating === 'Overweight') return { dir: 'long', labelFa: 'لانگ / خرید' };
  if (rating === 'Underweight' || rating === 'Sell') return { dir: 'short', labelFa: 'شورت / کاهش وزن' };
  return { dir: 'neutral', labelFa: 'خنثی / صبر' };
}

export function reconcileDeskSignals(params: {
  committeeRating: DeskRating | null;
  swingVerdict: SwingOpportunity['verdict'];
  swingScore: number;
  regimeState: 'on' | 'off' | 'unknown';
}): DeskConsensusResult {
  const cm = params.committeeRating
    ? directionFromCommitteeRating(params.committeeRating)
    : { dir: 'neutral' as const, labelFa: 'در حال بررسی' };

  const swingIsLong = params.swingVerdict === 'entry' || params.swingVerdict === 'accumulate';
  const swingIsAvoid = params.swingVerdict === 'avoid';
  const swingDirection: 'long' | 'neutral' = swingIsLong ? 'long' : 'neutral';
  const swingDirectionFa =
    params.swingVerdict === 'entry'
      ? 'لانگ سوینگ'
      : params.swingVerdict === 'accumulate'
        ? 'پله‌ای اسپات (میان‌مدت)'
        : swingIsAvoid
          ? 'ساختار نزولی — دور بمانید'
          : 'زیر نظر / صبر';

  // ۰) هشدار شکست حمایت در سوینگ
  if (swingIsAvoid) {
    return {
      committeeDirection: cm.dir,
      committeeDirectionFa: cm.labelFa,
      swingDirection: 'neutral',
      swingDirectionFa,
      alignment: 'aligned_caution',
      tone: 'loss',
      badgeFa: 'ساختار نزولی · دور بمانید',
      headlineFa: 'حمایت میان‌مدت شکسته شده یا فشار نزولی غالب است — فعلاً وارد نشوید',
      explanationFa:
        'مدل سوینگ نشانه‌های شکست حمایت یا ریزش فعال را تشخیص داده است؛ خرید در این نقطه به معنای گرفتن چاقوی در حال سقوط است.',
      actionRuleFa: 'نقد بمانید و تا بازگشت قیمت بالای حمایت و تثبیت چندروزه، ورود جدیدی انجام ندهید.'
    };
  }

  // ۱) هم‌سویی کامل روی لانگ
  if (cm.dir === 'long' && swingIsLong) {
    return {
      committeeDirection: cm.dir,
      committeeDirectionFa: cm.labelFa,
      swingDirection,
      swingDirectionFa,
      alignment: 'aligned_long',
      tone: 'gain',
      badgeFa: 'هم‌سو · لانگ',
      headlineFa: 'کمیته کوتاه‌مدت و مدل سوینگ میان‌مدت هر دو هم‌جهت روی خرید هستند',
      explanationFa:
        'ساختار تکنیکال کوتاه‌مدت و موقعیت ارزندگی میان‌مدت در یک جهت قرار دارند و تناقض تایم‌فریمی وجود ندارد.',
      actionRuleFa: 'ورود پله‌ای با رعایت حد ضرر و سقف ریسک ۱٪ سرمایه مجاز است.'
    };
  }

  // ۲) تضاد تایم‌فریم: کمیته کوتاه‌مدت نزولی/شورت، اما سوینگ میان‌مدت در ناحیه ارزنده خرید پله‌ای
  if (cm.dir === 'short' && swingIsLong) {
    return {
      committeeDirection: cm.dir,
      committeeDirectionFa: cm.labelFa,
      swingDirection,
      swingDirectionFa,
      alignment: 'timeframe_conflict',
      tone: 'warn',
      badgeFa: 'تضاد تایم‌فریم · احتیاط',
      headlineFa: 'فشار فروش کوتاه‌مدت در ناحیه ارزندهٔ میان‌مدت (تضاد تایم‌فریم)',
      explanationFa:
        'کمیته ایجنت‌ها بر اساس مومنتوم کوتاه‌مدت و رژیم محتاط بازار هشدار نزولی می‌دهد، اما مدل سوینگ به دلیل افت سنگین از سقف تاریخی این محدوده را فقط برای انباشت پله‌ای اسپات ارزیابی کرده است.',
      actionRuleFa:
        'از باز کردن لانگ اهرمی خودداری کنید؛ یا منتظر چرخش مومنتوم کوتاه‌مدت بمانید یا صرفاً در اسپات با پله‌های کوچک و بدون عجله اقدام کنید.'
    };
  }

  // ۳) کمیته کوتاه‌مدت شورت و سوینگ هم زیر نظر (رژیم ضعیف)
  if (cm.dir === 'short') {
    return {
      committeeDirection: cm.dir,
      committeeDirectionFa: cm.labelFa,
      swingDirection,
      swingDirectionFa,
      alignment: 'aligned_caution',
      tone: 'loss',
      badgeFa: 'احتیاط / فشار نزولی',
      headlineFa: 'مومنتوم کوتاه‌مدت منفی است و سوینگ نیز تأیید ورود نداده است',
      explanationFa:
        'روند فعلی به نفع خریدار نیست و هر دو بخش بر حفظ نقدینگی یا کاهش ریسک تأکید دارند.',
      actionRuleFa: 'خرید جدید را به تعویق بیندازید و حد ضرر موقعیت‌های باز را محافظت کنید.'
    };
  }

  // ۴) حالت خنثی / صبر یا لانگ کوتاه‌مدت بدون تأیید کامل سوینگ
  return {
    committeeDirection: cm.dir,
    committeeDirectionFa: cm.labelFa,
    swingDirection,
    swingDirectionFa,
    alignment: 'aligned_caution',
    tone: 'info',
    badgeFa: params.regimeState === 'off' ? 'رژیم محتاط · صبر' : 'انتظار برای هم‌سویی',
    headlineFa:
      cm.dir === 'long'
        ? 'سیگنال کوتاه‌مدت مثبت است، اما سوینگ میان‌مدت هنوز در حالت زیر نظر است'
        : 'بازار در وضعیت انتظار؛ فعلاً هم‌سویی کامل برای ورود پرحجم دیده نمی‌شود',
    explanationFa:
      'یکی از دو افق زمانی در حالت خنثی یا انتظار قرار دارد؛ بهترین تصمیم حفظ انضباط و صبر برای تأیید کامل است.',
    actionRuleFa: 'در صورت ورود، حجم را نصف حالت استاندارد نگه دارید و با پله‌بندی EOM عمل کنید.'
  };
}
