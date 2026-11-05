/**
 * راهنمای قدم‌به‌قدم ورود به هر بازار دلار بازده‌دار — بخش خالص
 *
 *   لینک فقط برای نشانی‌های رسمی بررسی‌شده؛ بقیه (و همهٔ بازارهای فقط‌نهادی) → صفحهٔ همان پول در DeFiLlama
 *   که خودش به سایت رسمی لینک می‌دهد. دارینو هیچ تراکنشی انجام نمی‌دهد و هیچ‌وقت عبارت بازیابی نمی‌خواهد.
 */
import type { StableMarket } from './stableYield';

export interface EntryGuide {
  url: string;
  /** نشانی رسمی پروتکل (true) یا صفحهٔ DeFiLlama (false) */
  official: boolean;
  host: string;
  steps: string[];
  exit: string;
  warnings: string[];
}

interface ProjectApp {
  url: string;
  /** کجای اپ: مسیر کلیک تا فرم سپرده */
  where: (m: StableMarket) => string;
  exit: string;
}

const APPS: Record<string, ProjectApp> = {
  'sky-lending': {
    url: 'https://app.sky.money',
    where: () => 'بخش Savings (پس‌انداز) را باز کنید؛ USDS را سپرده کنید تا sUSDS بگیرید. اگر USDC دارید، اول در بخش Trade همین اپ آن را به USDS تبدیل کنید.',
    exit: 'در همان بخش Savings گزینهٔ Withdraw؛ بدون دورهٔ انتظار.'
  },
  'spark-savings': {
    url: 'https://app.spark.fi',
    where: (m) => `بخش Savings را باز کنید و خزانهٔ ${m.symbol} را انتخاب کنید، بعد Deposit.`,
    exit: 'در همان بخش Savings گزینهٔ Withdraw؛ معمولاً فوری.'
  },
  sparklend: {
    url: 'https://app.spark.fi',
    where: (m) => `بخش SparkLend (Borrow/Lend) را باز کنید، ${m.symbol} را پیدا کنید و Supply را بزنید.`,
    exit: 'Withdraw در همان صفحه؛ اگر استفادهٔ بازار خیلی بالا باشد ممکن است موقتاً کامل ممکن نباشد.'
  },
  maple: {
    url: 'https://app.maple.finance',
    where: (m) => `بخش Syrup را باز کنید و ${m.meta ?? m.symbol} را انتخاب کنید، بعد Deposit.`,
    exit: 'درخواست برداشت در صف ثبت می‌شود و معمولاً ظرف چند روز پرداخت می‌شود؛ فروش توکن syrup در بازار هم ممکن است (با کمی تخفیف یا صرف).'
  },
  'ethena-usde': {
    url: 'https://app.ethena.fi',
    where: () => 'اول USDe بگیرید (در بخش Buy/Swap همین اپ یا یک صرافی غیرمتمرکز)، بعد در بخش Stake/Earn آن را استیک کنید تا sUSDe بگیرید.',
    exit: 'Unstake دورهٔ انتظار ۷ روزه دارد؛ برای خروج فوری باید sUSDe را در بازار بفروشید.'
  },
  'aave-v3': {
    url: 'https://app.aave.com',
    where: (m) => `بالای صفحه بازار شبکهٔ ${m.chain} را انتخاب کنید، در فهرست Supply دارایی ${m.symbol} را پیدا کنید و Supply را بزنید.`,
    exit: 'Withdraw در داشبورد؛ اگر استفادهٔ بازار نزدیک ۱۰۰٪ باشد، برداشت ممکن است موقتاً محدود شود.'
  },
  'morpho-blue': {
    url: 'https://app.morpho.org',
    where: (m) => `بخش Earn (Vaults) را باز کنید، شبکهٔ ${m.chain} را انتخاب کنید و خزانهٔ ${m.symbol} را جست‌وجو کنید، بعد Deposit.`,
    exit: 'Withdraw در صفحهٔ همان خزانه؛ اگر وام‌های خزانه پر باشد ممکن است کمی صبر لازم باشد.'
  },
  'jupiter-lend': {
    url: 'https://jup.ag/lend/earn',
    where: (m) => `در صفحهٔ Earn، ${m.symbol} را انتخاب کنید و Supply را بزنید.`,
    exit: 'Withdraw در همان صفحه؛ معمولاً فوری.'
  },
  'kamino-lend': {
    url: 'https://app.kamino.finance',
    where: (m) => `بخش Lend را باز کنید، ${m.meta ? `بازار ${m.meta}` : `بازار اصلی`} را انتخاب کنید و ${m.symbol} را Supply کنید.`,
    exit: 'Withdraw در همان صفحه؛ در استفادهٔ بالای بازار ممکن است محدود شود.'
  },
  'fluid-lending': {
    url: 'https://fluid.io',
    where: (m) => `بخش Lending را باز کنید و ${m.symbol} را انتخاب کنید، بعد Supply.`,
    exit: 'Withdraw در همان صفحه؛ معمولاً فوری.'
  },
  'usd-ai': {
    url: 'https://app.usd.ai',
    where: () => 'اول USDC را به USDai تبدیل کنید (Mint/Buy در همین اپ)، بعد آن را استیک کنید تا sUSDai بگیرید.',
    exit: 'Unstake دورهٔ انتظار ۳۰ روزه دارد؛ برای خروج زودتر باید در بازار بفروشید.'
  },
  'usual-usd0': {
    url: 'https://app.usual.money',
    where: (m) => `در اپ، ${m.symbol} را از بخش Earn بگیرید (اول USD0 بسازید یا بخرید).`,
    exit: 'خروج از توکن‌های قفل‌شدهٔ Usual ممکن است فقط با فروش در بازار و با تخفیف باشد؛ قبل از ورود شرایط را بخوانید.'
  },
  'justlend-v1': {
    url: 'https://app.justlend.org',
    where: (m) => `در بخش Supply، ${m.symbol} را انتخاب کنید و Supply را بزنید (کیف پول TronLink).`,
    exit: 'Withdraw در همان صفحه.'
  },
  'hyperliquid-earn': {
    url: 'https://app.hyperliquid.xyz',
    where: () => 'بعد از واریز USDC به حساب هایپرلیکوئید، بخش Earn را باز کنید و USDC را Supply کنید.',
    exit: 'Withdraw در بخش Earn، بعد برداشت از هایپرلیکوئید به کیف پول.'
  },
  'euler-v2': {
    url: 'https://app.euler.finance',
    where: (m) => `بخش Lend را باز کنید، شبکهٔ ${m.chain} و خزانهٔ ${m.symbol} را انتخاب کنید، بعد Supply.`,
    exit: 'Withdraw در همان صفحه.'
  },
  'lista-lending': {
    url: 'https://lista.org',
    where: (m) => `بخش Lending را باز کنید و ${m.symbol} را Supply کنید.`,
    exit: 'Withdraw در همان صفحه.'
  },
  'pareto-credit': {
    url: 'https://app.pareto.credit',
    where: (m) => `خزانهٔ اعتباری ${m.meta ?? m.symbol} را انتخاب کنید و Deposit را بزنید.`,
    exit: 'برداشت در دوره‌های مشخص خزانه انجام می‌شود (فوری نیست)؛ قبل از ورود زمان‌بندی را ببینید.'
  }
};

const WALLET: Record<string, { wallet: string; gas: string }> = {
  Solana: { wallet: 'فانتوم (Phantom) یا سولفلر', gas: 'کمی SOL' },
  Tron: { wallet: 'ترون‌لینک (TronLink)', gas: 'کمی TRX (یا انرژی)' },
  Aptos: { wallet: 'پترا (Petra)', gas: 'کمی APT' },
  Ethereum: { wallet: 'متامسک یا رابی (Rabby)', gas: 'کمی ETH (در اتریوم کارمزد هر تراکنش ممکن است چند دلار باشد)' },
  Base: { wallet: 'متامسک یا رابی (Rabby)', gas: 'کمی ETH روی Base' },
  Arbitrum: { wallet: 'متامسک یا رابی (Rabby)', gas: 'کمی ETH روی Arbitrum' },
  Optimism: { wallet: 'متامسک یا رابی (Rabby)', gas: 'کمی ETH روی Optimism' },
  BSC: { wallet: 'متامسک یا رابی (Rabby)', gas: 'کمی BNB' },
  Avalanche: { wallet: 'متامسک یا رابی (Rabby)', gas: 'کمی AVAX' },
  Polygon: { wallet: 'متامسک یا رابی (Rabby)', gas: 'کمی POL' },
  Hyperliquid: { wallet: 'متامسک یا رابی (Rabby)', gas: 'کارمزد ندارد (فقط هنگام واریز و برداشت)' }
};

const COIN_FA = { USDT: 'تتر', USDC: 'یو اس دی سی' } as const;

/** alt: همین پروتکل بازاری دارد که مستقیم همان دلار کاربر را می‌گیرد (مثلاً syrupUSDT به‌جای syrupUSDC) */
export function entryGuide(m: StableMarket, coin: 'USDT' | 'USDC', alt?: StableMarket | null): EntryGuide {
  const app = m.restricted ? undefined : APPS[m.project];
  const url = app?.url ?? `https://defillama.com/yields/pool/${m.pool}`;
  const host = new URL(url).hostname;
  const w = WALLET[m.chain] ?? { wallet: 'کیف پولی که از شبکهٔ ' + m.chain + ' پشتیبانی می‌کند', gas: 'کمی توکن کارمزد همان شبکه' };
  const coinFa = COIN_FA[coin];
  const needsSwap = m.direct !== coin;

  const steps: string[] = [];
  steps.push(`کیف پول ${w.wallet} را آماده کنید و روی شبکهٔ ${m.chain} باشید. برای کارمزد تراکنش‌ها ${w.gas} لازم است.`);
  steps.push(`${coinFa} را روی شبکهٔ ${m.chain} به این کیف پول بیاورید؛ ساده‌ترین راه برداشت مستقیم از صرافی با انتخاب همین شبکه است (شبکهٔ اشتباه = از دست رفتن پول).`);
  if (needsSwap && !app?.where(m).includes('تبدیل')) {
    steps.push(alt
      ? `این بازار ${m.direct ? COIN_FA[m.direct] : m.symbol} می‌گیرد، نه ${coinFa}. همین پروتکل بازار ${alt.meta ?? alt.symbol} را هم دارد که مستقیم ${coinFa} می‌گیرد؛ بدون تبدیل، همان را انتخاب کنید (یا ${coinFa} را تبدیل کنید).`
      : m.direct
      ? `این بازار ${COIN_FA[m.direct]} می‌گیرد، نه ${coinFa}. اول ${coinFa} را به ${COIN_FA[m.direct]} تبدیل کنید (صرافی یا سواپ غیرمتمرکز)؛ کارمزد و لغزش را در نظر بگیرید.`
      : `این بازار مستقیم ${coinFa} نمی‌گیرد؛ اگر اپ خودش تبدیل را انجام ندهد، ${coinFa} را با یک سواپ معتبر به دارایی موردنیاز تبدیل کنید.`);
  }
  if (m.restricted) {
    steps.push('این بازار فقط برای سرمایه‌گذار نهادی/تأییدشده است: احراز هویت (KYC) نزد صادرکننده و معمولاً حداقل سرمایهٔ بالا لازم است. از صفحهٔ DeFiLlama به سایت رسمی صادرکننده بروید و شرایط پذیرش را بخوانید.');
  } else {
    steps.push(`نشانی ${host} را باز کنید (نشانی را دقیق چک کنید)، دکمهٔ Connect Wallet را بزنید و کیف پول را وصل کنید.`);
    steps.push(app ? app.where(m) : `در اپ، بازار ${m.symbol}${m.meta ? ` (${m.meta})` : ''} روی شبکهٔ ${m.chain} را پیدا کنید و گزینهٔ Deposit/Supply را بزنید.`);
    steps.push(m.chain === 'Solana' || m.chain === 'Tron' || m.chain === 'Aptos'
      ? 'مبلغ را وارد کنید و تراکنش را در کیف پول تأیید کنید.'
      : 'مبلغ را وارد کنید؛ کیف پول دو تراکنش می‌خواهد: اول Approve (اجازهٔ خرج همان مبلغ، نه نامحدود) و بعد Deposit/Supply.');
    steps.push(`بعد از تأیید، ${m.direct ? 'توکن سهم همین بازار' : `توکن ${m.symbol}`} در کیف پولتان دیده می‌شود و ارزشش کم‌کم بالا می‌رود (یا سهم سپرده در داشبورد خود اپ). در «دارایی من» دارینو هم پیگیری می‌شود.`);
  }

  const warnings = [
    'اول با مبلغ کم امتحان کنید، بعد کل مبلغ.',
    'دارینو و هیچ پروتکل معتبری هیچ‌وقت عبارت بازیابی (Seed) یا کلید خصوصی نمی‌خواهد.',
    ...(m.lockup ? [`خروج دورهٔ انتظار دارد (${m.lockup}).`] : []),
    ...(app ? [] : ['نشانی رسمی این بازار در دارینو بررسی نشده؛ از لینک داخل صفحهٔ DeFiLlama به سایت رسمی بروید.'])
  ];

  return {
    url,
    official: !!app,
    host,
    steps,
    exit: app?.exit ?? (m.lockup ? `خروج دورهٔ انتظار دارد (${m.lockup})؛ جزئیات در سایت رسمی.` : 'در همان اپ گزینهٔ Withdraw/Redeem؛ شرایط خروج را قبل از ورود بخوانید.'),
    warnings
  };
}
