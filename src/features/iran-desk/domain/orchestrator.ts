/**
 * هماهنگ‌کننده مرکزی (Orchestrator) برای ۶ Agent تخصصی میز تحلیل هوشمند بازار سرمایه ایران
 *
 * ویژگی‌ها:
 *   • اجرای مستقل هر یک از ۶ Agent بدون تحریک ناخواسته سایر Agentها
 *   • اجرای کامل End-to-End (اسکنر → بنیادی → خوشبین → بدبین → مقایسه → مدیر ریسک → بکتست → گزارش یکپارچه)
 *   • اتصال امن به Google Gemini از طریق بک‌اند دارینو (`/api/integrations?op=iran-desk-agent`)
 *     با فال‌بک شفاف و کاملاً مبتنی بر داده‌های واقعی (بدون ساختن هیچ عدد یا خبر جعلی)
 *   • تطبیق کامل معیارها برای صندوق‌های سرمایه‌گذاری (جلوگیری از اعمال P/E شرکت روی صندوق درآمد ثابت)
 */
import { ASSET_TYPE_LABELS, DESK_AGENT_MAP } from './agents';
import { runHistoricalBacktest } from './backtester';
import { evaluateTradeRisk } from './riskManager';
import { runMarketScanner } from './scanner';
import type {
  AgentRunOutput,
  BacktestConfig,
  BacktestResult,
  DeskAgentId,
  DeskAssetType,
  FinalDeskVerdict,
  IntegratedAnalysisReport,
  RiskManagerInput,
  RiskManagerResult,
  ScannerSignalRow,
  UploadedCodalDocument,
  UploadedPriceDataset
} from './types';

export const FINAL_VERDICT_META: Record<
  FinalDeskVerdict,
  { labelFa: string; tone: 'gain' | 'warn' | 'loss' | 'info' | 'neutral' }
> = {
  opportunity_to_review: { labelFa: 'فرصت قابل بررسی', tone: 'gain' },
  needs_more_data: { labelFa: 'نیازمند داده بیشتر', tone: 'info' },
  high_risk: { labelFa: 'دارای ریسک بالا', tone: 'warn' },
  rejected_by_risk_manager: { labelFa: 'رد شده توسط مدیر ریسک', tone: 'loss' },
  insufficient_for_valid_analysis: { labelFa: 'فاقد شرایط کافی برای تحلیل معتبر', tone: 'neutral' }
};

export interface OrchestratorContext {
  symbol: string;
  nameFa: string;
  assetType: DeskAssetType;
  dataset: UploadedPriceDataset | null;
  documents: UploadedCodalDocument[];
  scannerSignals: ScannerSignalRow[];
  priorRuns: Partial<Record<DeskAgentId, AgentRunOutput>>;
  riskInput?: Partial<RiskManagerInput>;
  backtestConfig?: BacktestConfig;
  useGeminiIfAvailable?: boolean;
}

/** محاسبه آمار واقعی از سابقه قیمت بارگذاری‌شده */
function computePriceStats(dataset: UploadedPriceDataset | null) {
  if (!dataset || dataset.bars.length === 0) return null;
  const bars = [...dataset.bars].sort((a, b) => a.date.localeCompare(b.date));
  const latest = bars[bars.length - 1];
  const prev20 = bars.slice(-21, -1);
  const avgVol20 = prev20.length > 0 ? prev20.reduce((s, b) => s + b.volume, 0) / prev20.length : null;
  const avgVal20 = prev20.length > 0 ? prev20.reduce((s, b) => s + b.tradeValueRial, 0) / prev20.length : null;
  const high20 = prev20.length > 0 ? Math.max(...prev20.map((b) => Math.max(b.high, b.close))) : null;
  const low20 = prev20.length > 0 ? Math.min(...prev20.map((b) => Math.min(b.low, b.close))) : null;
  const navPremiumPct =
    latest.nav && latest.nav > 0 ? Number((((latest.close - latest.nav) / latest.nav) * 100).toFixed(2)) : null;

  return {
    barsCount: bars.length,
    firstDate: bars[0].date,
    lastDate: latest.date,
    latestClose: latest.close,
    latestVolume: latest.volume,
    latestNav: latest.nav ?? null,
    navPremiumPct,
    avgVol20,
    avgVal20,
    high20,
    low20
  };
}

/** اجرای قطعی و مستند Agent بنیادی (تطبیق‌شده برای سهام در برابر انواع صندوق) */
function runDeterministicFundamental(ctx: OrchestratorContext): AgentRunOutput {
  const stats = computePriceStats(ctx.dataset);
  const isFund = ctx.assetType.startsWith('fund_');
  const isFixedIncome = ctx.assetType === 'fund_fixed_income';
  const sources: string[] = [];
  const missing: string[] = [];

  if (ctx.dataset) sources.push(`${ctx.dataset.fileName} (آخرین داده: ${ctx.dataset.lastBarDate})`);
  else missing.push('فایل سابقه قیمت روزانه (CSV/Excel)');

  ctx.documents.forEach((d) => sources.push(`${d.title} (${d.reportDate})`));
  if (ctx.documents.length === 0) {
    missing.push(isFund ? 'گزارش ترکیب دارایی و NAV صندوق' : 'گزارش ماهانه / صورت مالی کدال');
  }

  if (!stats && ctx.documents.length === 0) {
    return {
      agentId: 'fundamental',
      symbol: ctx.symbol,
      executedAt: Date.now(),
      provider: 'deterministic',
      sufficientData: false,
      summaryFa: `دادهٔ کافی برای تحلیل بنیادی معتبر روی ${ctx.symbol} در دسترس نیست.`,
      detailsMarkdownFa: `برای تحلیل بنیادی **${ctx.nameFa}** (${ASSET_TYPE_LABELS[ctx.assetType]})، لطفاً ابتدا فایل سابقه قیمت روزانه و گزارش‌های کدال/صندوق را در بخش «مدیریت داده‌ها» بارگذاری کنید. هیچ عددی به‌صورت تخمینی ساخته نشد.`,
      dataSources: sources,
      missingData: missing
    };
  }

  const docMetrics = ctx.documents[0]?.metrics;
  const lines: string[] = [];
  lines.push(`### مشخصات و نوع دارایی`);
  lines.push(`- **نماد:** ${ctx.symbol} (${ctx.nameFa}) · **نوع:** ${ASSET_TYPE_LABELS[ctx.assetType]}`);
  if (stats) {
    lines.push(
      `- **داده واقعی قیمتی:** آخرین پایانی ${Math.round(stats.latestClose).toLocaleString('en-US')} ریال در تاریخ ${stats.lastDate} (منبع: ${ctx.dataset?.fileName})`
    );
  }

  if (isFund) {
    lines.push(`\n### تحلیل اختصاصی صندوق (${ASSET_TYPE_LABELS[ctx.assetType]})`);
    if (isFixedIncome) {
      lines.push(`- **نسبت P/E شرکتی:** نامرتبط با نوع صندوق (در صندوق درآمد ثابت، نرخ بهره، ترکیب اوراق/سپرده و کارمزد ملاک است).`);
    }
    const navVal = docMetrics?.navRial ?? stats?.latestNav ?? null;
    const prem =
      navVal && stats ? Number((((stats.latestClose - navVal) / navVal) * 100).toFixed(2)) : stats?.navPremiumPct ?? null;
    lines.push(
      navVal
        ? `- **ارزش خالص دارایی (NAV):** ${Math.round(navVal).toLocaleString('en-US')} ریال ${prem !== null ? `(فاصله قیمت بازار با NAV: ${prem > 0 ? '+' : ''}${prem}٪)` : ''}`
        : `- **NAV:** در داده‌های بارگذاری‌شده ثبت نشده است.`
    );
    if (!navVal) missing.push('NAV ابطال / صدور صندوق');
    lines.push(
      docMetrics?.aumBillionToman
        ? `- **ارزش کل دارایی‌ها (AUM):** ${docMetrics.aumBillionToman} میلیارد تومان`
        : `- **AUM / ترکیب دارایی:** نیازمند بارگذاری گزارش ماهانه صندوق.`
    );
    if (docMetrics?.expenseRatioPct !== null && docMetrics?.expenseRatioPct !== undefined) {
      lines.push(`- **هزینه و کارمزد صندوق:** ${docMetrics.expenseRatioPct}٪`);
    }
    if (isFixedIncome && docMetrics?.fixedIncomeBankSharePct !== null && docMetrics?.fixedIncomeBankSharePct !== undefined) {
      lines.push(`- **سهم سپرده بانکی و اوراق:** ${docMetrics.fixedIncomeBankSharePct}٪`);
    }
    if (!isFixedIncome && docMetrics?.topHoldingsConcentrationPct !== null && docMetrics?.topHoldingsConcentrationPct !== undefined) {
      lines.push(`- **تمرکز پرتفوی در سهام برتر:** ${docMetrics.topHoldingsConcentrationPct}٪`);
    }
  } else {
    lines.push(`\n### تحلیل بنیادی شرکت بورسی`);
    lines.push(
      docMetrics?.sales6mGrowthYoYPct !== null && docMetrics?.sales6mGrowthYoYPct !== undefined
        ? `- **روند فروش ۶ ماهه نسبت به پارسال (داده گزارش):** ${docMetrics.sales6mGrowthYoYPct > 0 ? '+' : ''}${docMetrics.sales6mGrowthYoYPct}٪`
        : `- **روند فروش ۶ ماهه:** در اسناد بارگذاری‌شده ثبت نشده (نیازمند گزارش ماهانه کدال).`
    );
    lines.push(
      docMetrics?.grossMarginPct !== null && docMetrics?.grossMarginPct !== undefined
        ? `- **حاشیه سود ناخالص / خالص:** ناخالص ${docMetrics.grossMarginPct}٪${docMetrics.netMarginPct !== null && docMetrics.netMarginPct !== undefined ? ` · خالص ${docMetrics.netMarginPct}٪` : ''}`
        : `- **حاشیه سود ناخالص و خالص:** نیازمند صورت مالی میاندوره‌ای/سالانه کدال.`
    );
    lines.push(
      docMetrics?.pe && docMetrics?.sectorAvgPe
        ? `- **نسبت P/E در برابر صنعت:** ${docMetrics.pe} در برابر میانگین صنعت ${docMetrics.sectorAvgPe}`
        : `- **مقایسه P/E با صنعت:** دادهٔ معتبر میانگین صنعت در ورودی موجود نیست (تخمین زده نشد).`
    );
    lines.push(`- **حداقل ۳ ریسک ساختاری قابل بررسی:** ۱) نوسانات نرخ ارز و قیمت‌های جهانی ۲) قیمت‌گذاری دستوری و محدودیت‌های صادراتی ۳) هزینه مالی، بدهی و تغییر مقررات صنعت.`);
  }

  // ناحیه ورود، حد ضرر و هدف فقط در صورت وجود دادهٔ قیمت ۲۰ روزه واقعی
  const suggestedEntry = stats ? stats.latestClose : null;
  const suggestedStop = stats && stats.low20 ? Math.min(stats.low20, Math.round(stats.latestClose * 0.94)) : null;
  const suggestedTarget =
    suggestedEntry && suggestedStop ? Math.round(suggestedEntry + (suggestedEntry - suggestedStop) * 2.2) : null;

  lines.push(`\n### تز معاملاتی اولیه (بر پایه داده‌های موجود)`);
  lines.push(`- **ناحیه ورود (محاسبه از داده واقعی):** ${suggestedEntry ? `${Math.round(suggestedEntry).toLocaleString('en-US')} ریال` : 'قابل محاسبه نیست (نیاز به سابقه قیمت)'}`);
  lines.push(`- **حد ضرر مرجع (کف ۲۰ روزه / حمایت):** ${suggestedStop ? `${Math.round(suggestedStop).toLocaleString('en-US')} ریال` : 'قابل محاسبه نیست'}`);
  lines.push(`- **محدوده هدف (نسبت ۲.۲ به ۱):** ${suggestedTarget ? `${Math.round(suggestedTarget).toLocaleString('en-US')} ریال` : 'قابل محاسبه نیست'}`);
  lines.push(`- **شرط ابطال تز:** شکست تثبیت‌شده به زیر حمایت ۲۰ روزه یا انتشار گزارش ماهانه/کدال با افت محسوس فروش یا سودآوری.`);

  return {
    agentId: 'fundamental',
    symbol: ctx.symbol,
    executedAt: Date.now(),
    provider: 'deterministic',
    sufficientData: Boolean(stats || ctx.documents.length > 0),
    summaryFa: stats
      ? `تز اولیه برای ${ctx.symbol} روی قیمت ${Math.round(stats.latestClose).toLocaleString('en-US')} ریال (${stats.lastDate}) با ${ctx.documents.length} سند کدال/صندوق تنظیم شد.`
      : `بررسی اولیه روی ${ctx.documents.length} سند بارگذاری‌شده انجام شد؛ برای سطوح قیمتی نیاز به سابقه قیمت روزانه است.`,
    detailsMarkdownFa: lines.join('\n'),
    dataSources: sources,
    missingData: missing,
    meta: { suggestedEntry, suggestedStop, suggestedTarget }
  };
}

/** اجرای قطعی Agent خوشبین (مستند به تز بنیادی و داده‌های واقعی) */
function runDeterministicBull(ctx: OrchestratorContext): AgentRunOutput {
  const stats = computePriceStats(ctx.dataset);
  const fund = ctx.priorRuns.fundamental;
  const sources = [...new Set([...(fund?.dataSources ?? []), ...(ctx.dataset ? [ctx.dataset.fileName] : [])])];
  const reasons: string[] = [];

  if (ctx.scannerSignals.some((s) => s.signalCode === 'real_money_inflow_3d')) {
    const s = ctx.scannerSignals.find((x) => x.signalCode === 'real_money_inflow_3d')!;
    reasons.push(`۱. **ورود پول حقیقی پایدار:** ${s.exactValueFa} (منبع: ${s.sourceName} · اعتبار: قوی).`);
  }
  if (ctx.scannerSignals.some((s) => s.signalCode === 'volume_spike_2x' || s.signalCode === 'fund_liquidity_surge')) {
    const s = ctx.scannerSignals.find((x) => x.signalCode === 'volume_spike_2x' || x.signalCode === 'fund_liquidity_surge')!;
    reasons.push(`۲. **جهش تقاضا و نقدشوندگی:** ${s.exactValueFa} (منبع: ${s.sourceName} · اعتبار: قوی).`);
  }
  if (ctx.scannerSignals.some((s) => s.signalCode === 'breakout_20d')) {
    const s = ctx.scannerSignals.find((x) => x.signalCode === 'breakout_20d')!;
    reasons.push(`۳. **شکست ساختار قیمتی ۲۰ روزه:** ${s.exactValueFa} (منبع: ${s.sourceName} · اعتبار: متوسط تا قوی).`);
  }
  if (ctx.scannerSignals.some((s) => s.signalCode === 'fund_nav_discount')) {
    const s = ctx.scannerSignals.find((x) => x.signalCode === 'fund_nav_discount')!;
    reasons.push(`۴. **تخفیف نسبت به NAV:** ${s.exactValueFa} (اعتبار: قوی برای صندوق).`);
  }
  if (ctx.documents.length > 0) {
    reasons.push(`۵. **پشتوانه اسناد رسمی بارگذاری‌شده:** ${ctx.documents.length} گزارش/اطلاعیه کدال در سیستم ثبت شده است.`);
  }

  if (reasons.length === 0) {
    return {
      agentId: 'bull',
      symbol: ctx.symbol,
      executedAt: Date.now(),
      provider: 'deterministic',
      sufficientData: false,
      summaryFa: `در داده‌های فعلی ${ctx.symbol}، شواهد مستند کافی برای تدوین ۵ دلیل قوی خوشبینانه وجود ندارد.`,
      detailsMarkdownFa: `بر اساس قانون منع دلیل احساسی و شایعه، تحلیلگر خوشبین بدون سیگنال معتبر یا گزارش مالی مثبت عدد یا دلیل ساختگی ارائه نمی‌کند. لطفاً داده قیمت و گزارش‌های کدال را تکمیل کنید.`,
      dataSources: sources,
      missingData: ['سیگنال معتبر اسکنر یا گزارش بنیادی مثبت'],
      meta: { strengthScore: 1 }
    };
  }

  const strengthScore = Math.min(10, reasons.length * 2 + (stats ? 1 : 0));
  return {
    agentId: 'bull',
    symbol: ctx.symbol,
    executedAt: Date.now(),
    provider: 'deterministic',
    sufficientData: true,
    summaryFa: `${reasons.length} دلیل مستند به داده برای سناریوی خوشبینانه روی ${ctx.symbol} شناسایی شد (امتیاز شواهد: ${strengthScore}/۱۰).`,
    detailsMarkdownFa: [
      '### دلایل مستند موافق معامله',
      ...reasons,
      '\n### بهترین سناریو و شرط تحقق',
      '- تداوم حجم بالای معاملات، حفظ قیمت بالای سطح شکست ۲۰ روزه و تأیید روند در گزارش ماهانه بعدی.',
      '- **نشانه‌های پیگیری آینده:** تداوم تراز مثبت حقیقی و عدم کاهش ارزش معاملات روزانه.'
    ].join('\n'),
    dataSources: sources,
    missingData: reasons.length < 5 ? ['برای تکمیل ۵ دلیل مستند، داده‌های کدال بیشتری بارگذاری شود.'] : [],
    meta: { strengthScore }
  };
}

/** اجرای قطعی Agent بدبین (وکیل مدافع شیطان) */
function runDeterministicBear(ctx: OrchestratorContext): AgentRunOutput {
  const stats = computePriceStats(ctx.dataset);
  const sources = [...new Set([...(ctx.dataset ? [ctx.dataset.fileName] : []), ...ctx.documents.map((d) => d.title)])];
  const risks: string[] = [];

  if (ctx.documents.length === 0) {
    risks.push(`۱. **فقدان سند بنیادی / کدال:** هیچ گزارش ماهانه یا صورت مالی رسمی برای ${ctx.symbol} بارگذاری نشده؛ ورود بدون بررسی گزارش مالی ریسک خطای بنیادی را به‌شدت بالا می‌برد.`);
  }
  if (!stats || stats.barsCount < 60) {
    risks.push(`۲. **سابقه قیمتی کوتاه:** تعداد روزهای تاریخی موجود (${stats?.barsCount ?? 0} روز) برای سنجش رفتار نماد در دوره‌های رکودی و صف فروش کافی نیست.`);
  }
  if (stats?.navPremiumPct !== null && stats?.navPremiumPct !== undefined && stats.navPremiumPct > 3) {
    risks.push(`۳. **حباب مثبت نسبت به NAV:** معامله صندوق با ${stats.navPremiumPct}٪ حباب بالاتر از NAV ریسک افت سریع هنگام اصلاح بازار دارد.`);
  } else {
    risks.push(`۳. **ریسک کلان بازار سرمایه ایران:** تغییرات نرخ بهره بدون ریسک، سیاست‌های ارزی، قیمت‌گذاری دستوری و ریسک‌های سیاسی می‌تواند کل بازار را وارد فاز صف فروش کند.`);
  }
  risks.push(`۴. **ریسک صف فروش و دامنه نوسان:** در بورس ایران هنگام اخبار منفی، صف فروش باعث می‌شود حد ضرر روی قیمت دلخواه اجرا نشود.`);
  if (ctx.scannerSignals.length === 0) {
    risks.push(`۵. **نبود تأیید اسکنر:** هیچ سیگنال قدرتمند ورود پول یا شکست مقاومت در داده‌های اخیر ثبت نشده است.`);
  } else {
    risks.push(`۵. **ریسک شکست جعلی (Fake Breakout):** ورود پس از جهش کوتاه‌مدت حجم بدون تثبیت چندروزه می‌تواند منجر به خرید در سقف کوتاه‌مدت شود.`);
  }

  const bearScore = Math.min(10, risks.length * 2 - (ctx.documents.length > 0 ? 1 : 0));
  const bullScore = ctx.priorRuns.bull?.meta?.strengthScore ?? 0;
  const bearStronger = bearScore >= bullScore;

  return {
    agentId: 'bear',
    symbol: ctx.symbol,
    executedAt: Date.now(),
    provider: 'deterministic',
    sufficientData: true,
    summaryFa: bearStronger
      ? `هشدار وکیل مدافع شیطان: دلایل مخالف (${bearScore}/۱۰) قوی‌تر یا هم‌سطح دلایل موافق (${bullScore}/۱۰) هستند؛ توقف و بازنگری پیشنهاد می‌شود.`
      : `۵ ریسک جدی مخالف معامله شناسایی شد (شدت ریسک: ${bearScore}/۱۰) که باید پیش از ورود پاسخ منطقی داشته باشند.`,
    detailsMarkdownFa: [
      '### ۵ دلیل اصلی مخالفت و ریسک‌های شکست معامله',
      ...risks,
      '\n### سناریوی بدبینانه و شرط شکست کامل',
      '- بازگشت قیمت به زیر حمایت ۲۰ روزه همراه با تشکیل صف فروش و افت هم‌زمان شاخص کل یا افزایش نرخ بهره.',
      bearStronger
        ? '- **نتیجه مقایسه بدبین در برابر خوشبین:** در شرایط فعلی شواهد مخالفت سنگین‌تر است و معامله ارزش ریسک ندارد.'
        : '- **نتیجه مقایسه:** معامله فقط در صورت تأیید قطعی مدیر ریسک و رعایت کامل حد ضرر قابل بررسی است.'
    ].join('\n'),
    dataSources: sources,
    missingData: ctx.documents.length === 0 ? ['گزارش مالی و کدال برای راستی‌آزمایی ریسک‌های بنیادی'] : [],
    meta: { strengthScore: bearScore }
  };
}

/** فراخوانی اختیاری Gemini روی بک‌اند دارینو برای یک Agent مشخص (با فال‌بک امن به موتور قطعی) */
async function tryGeminiAgent(
  agentId: DeskAgentId,
  ctx: OrchestratorContext,
  deterministic: AgentRunOutput
): Promise<AgentRunOutput> {
  if (!ctx.useGeminiIfAvailable) return deterministic;
  try {
    const def = DESK_AGENT_MAP[agentId];
    const res = await fetch('/api/integrations?op=iran-desk-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId,
        symbol: ctx.symbol,
        nameFa: ctx.nameFa,
        assetType: ctx.assetType,
        systemInstruction: def.systemInstruction,
        payload: {
          datasetMeta: ctx.dataset
            ? {
                fileName: ctx.dataset.fileName,
                lastBarDate: ctx.dataset.lastBarDate,
                barsCount: ctx.dataset.bars.length,
                recentBars: ctx.dataset.bars.slice(-25)
              }
            : null,
          documents: ctx.documents.map((d) => ({
            title: d.title,
            date: d.reportDate,
            metrics: d.metrics ?? null,
            excerpt: d.extractedText.slice(0, 2500)
          })),
          scannerSignals: ctx.scannerSignals,
          priorSummaries: Object.fromEntries(
            Object.entries(ctx.priorRuns).map(([k, v]) => [k, v?.summaryFa ?? ''])
          ),
          deterministicBaseline: deterministic.detailsMarkdownFa
        }
      }),
      signal: AbortSignal.timeout(45_000)
    });
    if (!res.ok) return deterministic;
    const data = (await res.json()) as { answer?: string; summary?: string };
    if (!data?.answer || data.answer.trim().length < 20) return deterministic;
    return {
      ...deterministic,
      provider: 'gemini',
      summaryFa: data.summary?.trim() || deterministic.summaryFa,
      detailsMarkdownFa: data.answer.trim()
    };
  } catch {
    return deterministic;
  }
}

/** اجرای مستقل یک Agent خاص */
export async function runSingleDeskAgent(agentId: DeskAgentId, ctx: OrchestratorContext): Promise<AgentRunOutput> {
  if (agentId === 'scanner') {
    const scan = runMarketScanner({
      datasets: ctx.dataset ? [ctx.dataset] : [],
      documents: ctx.documents,
      selectedSymbols: [ctx.symbol]
    });
    return {
      agentId: 'scanner',
      symbol: ctx.symbol,
      executedAt: scan.executedAt,
      provider: 'deterministic',
      sufficientData: Boolean(ctx.dataset || ctx.documents.length),
      summaryFa:
        scan.rows.length > 0
          ? `${scan.rows.length} سیگنال معتبر برای ${ctx.symbol} شناسایی شد.`
          : scan.emptyMessageFa ?? 'سیگنال معتبری یافت نشد.',
      detailsMarkdownFa:
        scan.rows.length > 0
          ? scan.rows.map((r) => `- **${r.signalTitleFa}**: ${r.exactValueFa} (قدرت: ${r.strength} · منبع: ${r.sourceName})`).join('\n')
          : 'در داده‌های بررسی‌شده، نمادی که شرایط تعریف‌شده را داشته باشد پیدا نشد.',
      dataSources: ctx.dataset ? [ctx.dataset.fileName] : [],
      missingData: scan.missingDataNotes
    };
  }

  if (agentId === 'fundamental') {
    const base = runDeterministicFundamental(ctx);
    return tryGeminiAgent('fundamental', ctx, base);
  }
  if (agentId === 'bull') {
    const base = runDeterministicBull(ctx);
    return tryGeminiAgent('bull', ctx, base);
  }
  if (agentId === 'bear') {
    const base = runDeterministicBear(ctx);
    return tryGeminiAgent('bear', ctx, base);
  }
  if (agentId === 'risk_manager') {
    const stats = computePriceStats(ctx.dataset);
    const fundMeta = ctx.priorRuns.fundamental?.meta;
    const riskInput: RiskManagerInput = {
      symbol: ctx.symbol,
      assetType: ctx.assetType,
      totalCapitalRial: ctx.riskInput?.totalCapitalRial ?? 1_000_000_000,
      maxRiskPct: ctx.riskInput?.maxRiskPct ?? 1,
      entryPriceRial: ctx.riskInput?.entryPriceRial ?? fundMeta?.suggestedEntry ?? stats?.latestClose ?? 0,
      stopLossRial: ctx.riskInput?.stopLossRial ?? fundMeta?.suggestedStop ?? 0,
      targetPriceRial: ctx.riskInput?.targetPriceRial ?? fundMeta?.suggestedTarget ?? 0,
      avgDailyTradeValueRial: ctx.riskInput?.avgDailyTradeValueRial ?? stats?.avgVal20 ?? null,
      dailyPriceLimitPct: ctx.riskInput?.dailyPriceLimitPct ?? (ctx.assetType.startsWith('fund_') ? 10 : 3),
      existingPortfolioExposurePct: ctx.riskInput?.existingPortfolioExposurePct ?? 0,
      sameSectorExposurePct: ctx.riskInput?.sameSectorExposurePct ?? 0,
      bearStrongerThanBull:
        (ctx.priorRuns.bear?.meta?.strengthScore ?? 0) >= (ctx.priorRuns.bull?.meta?.strengthScore ?? 0)
    };
    const r = evaluateTradeRisk(riskInput);
    return {
      agentId: 'risk_manager',
      symbol: ctx.symbol,
      executedAt: Date.now(),
      provider: 'deterministic',
      sufficientData: riskInput.entryPriceRial > 0 && riskInput.stopLossRial > 0 && riskInput.targetPriceRial > 0,
      summaryFa: r.verdictTitleFa,
      detailsMarkdownFa: [
        `### حکم مدیر ریسک: ${r.verdictTitleFa}`,
        ...r.formulasFa.map((f) => `- ${f}`),
        ...(r.rejectionReasons.length ? ['\n### دلایل رد', ...r.rejectionReasons.map((x) => `- ❌ ${x}`)] : []),
        ...(r.warnings.length ? ['\n### هشدارها', ...r.warnings.map((x) => `- ⚠️ ${x}`)] : [])
      ].join('\n'),
      dataSources: ctx.dataset ? [ctx.dataset.fileName] : ['ورودی دستی کاربر'],
      missingData: r.avgDailyVolumeSharePct === null ? ['میانگین ارزش معاملات روزانه برای سنجش ۵٪ نقدشوندگی'] : []
    };
  }

  // backtester
  if (!ctx.dataset || ctx.dataset.bars.length < 35) {
    return {
      agentId: 'backtester',
      symbol: ctx.symbol,
      executedAt: Date.now(),
      provider: 'deterministic',
      sufficientData: false,
      summaryFa: 'برای اجرای بکتست واقعی، فایل سابقه قیمت روزانه معتبر (حداقل ۳۵ روز و ترجیحاً ۳ تا ۵ سال) لازم است.',
      detailsMarkdownFa: 'هیچ عدد تخمینی یا ساختگی تولید نشد. لطفاً فایل CSV سابقه قیمت را بارگذاری کنید.',
      dataSources: ctx.dataset ? [ctx.dataset.fileName] : [],
      missingData: ['سابقه قیمت روزانه کافی برای بکتست']
    };
  }
  const bt = runHistoricalBacktest({
    symbol: ctx.symbol,
    fileName: ctx.dataset.fileName,
    bars: ctx.dataset.bars,
    config: ctx.backtestConfig ?? {
      strategyId: 'breakout_20d',
      initialCapitalRial: ctx.riskInput?.totalCapitalRial ?? 1_000_000_000,
      stopLossPct: 5,
      takeProfitPct: 12,
      roundTripCommissionPct: ctx.assetType.startsWith('fund_') ? 0.23 : 1.25,
      commissionAssumptionFa: ctx.assetType.startsWith('fund_')
        ? 'نرخ استاندارد صندوق‌های ETF (~۰.۲۳٪)'
        : 'نرخ استاندارد سهام بورس (~۱.۲۵٪)'
    }
  });
  return {
    agentId: 'backtester',
    symbol: ctx.symbol,
    executedAt: bt.executedAt,
    provider: 'deterministic',
    sufficientData: true,
    summaryFa: `بکتست روی ${bt.barsUsed} روز: ${bt.totalTrades} معامله · نرخ برد ${bt.winRatePct}٪ · بازده ${bt.totalReturnPct}٪ (در برابر خرید و نگهداری ${bt.buyAndHoldReturnPct}٪).`,
    detailsMarkdownFa: [
      `- **بازه داده:** ${bt.startDate} تا ${bt.endDate} (${bt.barsUsed} روز معاملاتی)`,
      `- **تعداد معاملات:** ${bt.totalTrades} ${bt.reliabilityWarningFa ? `⚠️ ${bt.reliabilityWarningFa}` : '✅ (کافی از نظر آماری)'}`,
      `- **بیشترین افت سرمایه (Max Drawdown):** ${bt.maxDrawdownPct}٪`,
      `- **اثر کارمزد:** ${bt.totalCommissionRial.toLocaleString('en-US')} ریال`,
      `- ${bt.disclaimerFa}`
    ].join('\n'),
    dataSources: [ctx.dataset.fileName],
    missingData: bt.statisticallyReliable ? [] : ['سابقه طولانی‌تر برای رسیدن به حداقل ۳۰ معامله']
  };
}

/**
 * اجرای کامل تحلیل از ابتدا تا انتها (بخش ۱۱ درخواست):
 *   ۱) کفایت داده → ۲) اسکنر → ۳) بنیادی → ۴) خوشبین → ۵) بدبین → ۶) مقایسه → ۷) مدیر ریسک → ۸) بکتست → ۹) گزارش نهایی یکپارچه
 */
export async function runFullAnalysisPipeline(ctx: OrchestratorContext): Promise<{
  report: IntegratedAnalysisReport;
  runs: Partial<Record<DeskAgentId, AgentRunOutput>>;
  riskResult: RiskManagerResult | null;
  backtestResult: BacktestResult | null;
}> {
  const runs: Partial<Record<DeskAgentId, AgentRunOutput>> = { ...ctx.priorRuns };
  const scannerOut = await runSingleDeskAgent('scanner', ctx);
  runs.scanner = scannerOut;

  const scanRes = runMarketScanner({
    datasets: ctx.dataset ? [ctx.dataset] : [],
    documents: ctx.documents,
    selectedSymbols: [ctx.symbol]
  });

  const ctx2: OrchestratorContext = { ...ctx, scannerSignals: scanRes.rows, priorRuns: runs };
  const fundOut = await runSingleDeskAgent('fundamental', ctx2);
  runs.fundamental = fundOut;

  const ctx3: OrchestratorContext = { ...ctx2, priorRuns: runs };
  const bullOut = await runSingleDeskAgent('bull', ctx3);
  runs.bull = bullOut;

  const ctx4: OrchestratorContext = { ...ctx3, priorRuns: runs };
  const bearOut = await runSingleDeskAgent('bear', ctx4);
  runs.bear = bearOut;

  const bullScore = bullOut.meta?.strengthScore ?? 0;
  const bearScore = bearOut.meta?.strengthScore ?? 0;
  const bearOutweighsBull = bearScore >= bullScore;

  // مدیر ریسک
  const stats = computePriceStats(ctx.dataset);
  const entry = ctx.riskInput?.entryPriceRial ?? fundOut.meta?.suggestedEntry ?? stats?.latestClose ?? 0;
  const stop = ctx.riskInput?.stopLossRial ?? fundOut.meta?.suggestedStop ?? 0;
  const target = ctx.riskInput?.targetPriceRial ?? fundOut.meta?.suggestedTarget ?? 0;

  let riskResult: RiskManagerResult | null = null;
  if (entry > 0 && stop > 0 && target > 0) {
    riskResult = evaluateTradeRisk({
      symbol: ctx.symbol,
      assetType: ctx.assetType,
      totalCapitalRial: ctx.riskInput?.totalCapitalRial ?? 1_000_000_000,
      maxRiskPct: ctx.riskInput?.maxRiskPct ?? 1,
      entryPriceRial: entry,
      stopLossRial: stop,
      targetPriceRial: target,
      avgDailyTradeValueRial: ctx.riskInput?.avgDailyTradeValueRial ?? stats?.avgVal20 ?? null,
      dailyPriceLimitPct: ctx.riskInput?.dailyPriceLimitPct ?? (ctx.assetType.startsWith('fund_') ? 10 : 3),
      existingPortfolioExposurePct: ctx.riskInput?.existingPortfolioExposurePct ?? 0,
      sameSectorExposurePct: ctx.riskInput?.sameSectorExposurePct ?? 0,
      bearStrongerThanBull: bearOutweighsBull
    });
    runs.risk_manager = await runSingleDeskAgent('risk_manager', { ...ctx4, priorRuns: runs });
  }

  // بکتست (فقط در صورت وجود داده تاریخی واقعی کافی)
  let backtestResult: BacktestResult | null = null;
  if (ctx.dataset && ctx.dataset.bars.length >= 35) {
    backtestResult = runHistoricalBacktest({
      symbol: ctx.symbol,
      fileName: ctx.dataset.fileName,
      bars: ctx.dataset.bars,
      config: ctx.backtestConfig ?? {
        strategyId: 'breakout_20d',
        initialCapitalRial: ctx.riskInput?.totalCapitalRial ?? 1_000_000_000,
        stopLossPct: 5,
        takeProfitPct: 12,
        roundTripCommissionPct: ctx.assetType.startsWith('fund_') ? 0.23 : 1.25,
        commissionAssumptionFa: ctx.assetType.startsWith('fund_')
          ? 'کارمزد استاندارد صندوق ETF (~۰.۲۳٪)'
          : 'کارمزد استاندارد سهام بورس (~۱.۲۵٪)'
      }
    });
    runs.backtester = await runSingleDeskAgent('backtester', { ...ctx4, priorRuns: runs });
  }

  // تعیین وضعیت نهایی شفاف (یکی از ۵ وضعیت استاندارد)
  const uncertainties = [...new Set([...fundOut.missingData, ...bullOut.missingData, ...bearOut.missingData])];
  let finalVerdict: FinalDeskVerdict;
  if (!ctx.dataset && ctx.documents.length === 0) {
    finalVerdict = 'insufficient_for_valid_analysis';
  } else if (riskResult && !riskResult.approved) {
    finalVerdict = 'rejected_by_risk_manager';
  } else if (bearOutweighsBull || (riskResult && riskResult.warnings.length >= 2)) {
    finalVerdict = 'high_risk';
  } else if (!ctx.dataset || ctx.documents.length === 0) {
    finalVerdict = 'needs_more_data';
  } else {
    finalVerdict = 'opportunity_to_review';
  }

  const dataSources = [
    ...(ctx.dataset ? [`${ctx.dataset.fileName} (آخرین تاریخ: ${ctx.dataset.lastBarDate})`] : []),
    ...ctx.documents.map((d) => `${d.title} (${d.reportDate})`)
  ];

  const report: IntegratedAnalysisReport = {
    id: `rep-${ctx.symbol}-${Date.now()}`,
    symbol: ctx.symbol,
    nameFa: ctx.nameFa,
    assetType: ctx.assetType,
    createdAt: Date.now(),
    dataSources,
    dataSufficiencyFa:
      ctx.dataset && ctx.documents.length > 0
        ? `مناسب (${ctx.dataset.bars.length} روز قیمت + ${ctx.documents.length} سند کدال/صندوق)`
        : ctx.dataset
          ? `نیمه‌کامل (${ctx.dataset.bars.length} روز قیمت؛ بدون سند کدال/صندوق)`
          : ctx.documents.length > 0
            ? `نیمه‌کامل (${ctx.documents.length} سند؛ بدون سابقه قیمت روزانه)`
            : 'ناکافی (هیچ فایل قیمت یا گزارش کدال بارگذاری نشده)',
    scannerSignals: scanRes.rows,
    fundamental: fundOut,
    bull: bullOut,
    bear: bearOut,
    bearOutweighsBull,
    risk: riskResult,
    backtest: backtestResult,
    uncertainties,
    finalVerdict,
    finalVerdictLabelFa: FINAL_VERDICT_META[finalVerdict].labelFa,
    executiveSummaryFa:
      finalVerdict === 'opportunity_to_review'
        ? `${ctx.symbol} با تأیید مدیر ریسک و داده‌های موجود، به‌عنوان فرصت قابل بررسی (نه توصیه قطعی) ثبت شد.`
        : finalVerdict === 'rejected_by_risk_manager'
          ? `${ctx.symbol} توسط مدیر ریسک رد شد: ${riskResult?.rejectionReasons[0] ?? 'عدم رعایت سیاست ریسک'}.`
          : finalVerdict === 'high_risk'
            ? `${ctx.symbol} دارای ریسک بالا تشخیص داده شد (دلایل بدبین قوی‌تر یا هشدارهای نقدشوندگی/تمرکز فعال است).`
            : `${ctx.symbol} برای تحلیل معتبر نیازمند تکمیل داده‌های قیمتی و اسناد رسمی است.`
  };

  return { report, runs, riskResult, backtestResult };
}
