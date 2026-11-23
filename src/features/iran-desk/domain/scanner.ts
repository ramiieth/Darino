/**
 * موتور محاسباتی واقعی Agent 1: اسکنر بازار (Market Scanner)
 *
 * سیگنال‌های دقیق (بدون تولید سیگنال ساختگی):
 *   ۱) ورود پول حقیقی ۳ روز متوالی: خرید حقیقی > فروش حقیقی در هر ۳ روز آخر
 *   ۲) جهش حجم معاملات: حجم امروز ÷ میانگین حجم ۲۰ روز گذشته > ۲
 *   ۳) شکست مقاومت ۲۰ روزه: قیمت پایانی امروز > بیشترین قیمت (سقف) ۲۰ روز قبل (بدون لحاظ امروز)
 *   ۴) اطلاعیه مهم کدال: بررسی اسناد کدال بارگذاری‌شده برای رویدادهای بااهمیت
 *   ۵) سیگنال‌های اختصاصی صندوق‌ها: تخفیف یا حباب قابل‌توجه نسبت به NAV، و جهش حجم نقدشوندگی
 */
import type {
  ScannerResult,
  ScannerSignalRow,
  SignalStrength,
  UploadedCodalDocument,
  UploadedPriceDataset
} from './types';

const MATERIAL_CODAL_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /افزایش\s*سرمایه/, label: 'اطلاعیه افزایش سرمایه' },
  { re: /تقسیم\s*سود|مجمع\s*عمومی/, label: 'تصمیم مجمع / تقسیم سود' },
  { re: /قرارداد\s*مهم|افشای\s*اطلاعات\s*بااهمیت|گروه\s*الف/, label: 'افشای اطلاعات بااهمیت (گروه الف/ب)' },
  { re: /تعدیل\s*نرخ|افزایش\s*نرخ\s*فروش/, label: 'تعدیل / افزایش نرخ فروش' },
  { re: /گزارش\s*ماهانه|تولید\s*و\s*فروش/, label: 'گزارش فعالیت ماهانه' }
];

const STRENGTH_SCORE: Record<SignalStrength, number> = { strong: 3, medium: 2, weak: 1 };

export function runMarketScanner(params: {
  datasets: readonly UploadedPriceDataset[];
  documents: readonly UploadedCodalDocument[];
  selectedSymbols?: readonly string[];
  maxTopSymbols?: number;
}): ScannerResult {
  const maxTop = params.maxTopSymbols ?? 5;
  const filterSet = params.selectedSymbols?.length
    ? new Set(params.selectedSymbols.map((s) => s.trim()))
    : null;

  const targetDatasets = params.datasets.filter((d) => !filterSet || filterSet.has(d.symbol));
  const missingDataNotes: string[] = [];
  const allSignals: ScannerSignalRow[] = [];

  for (const ds of targetDatasets) {
    const bars = [...ds.bars].sort((a, b) => a.date.localeCompare(b.date));
    if (bars.length === 0) continue;

    const latest = bars[bars.length - 1];
    const isFund = ds.assetType.startsWith('fund_');

    // ۱) ورود پول حقیقی در ۳ روز متوالی
    if (bars.length >= 3) {
      const last3 = bars.slice(-3);
      const hasRealData = last3.every(
        (b) =>
          b.realBuyVolume !== null &&
          b.realBuyVolume !== undefined &&
          b.realSellVolume !== null &&
          b.realSellVolume !== undefined
      );
      if (hasRealData) {
        const allInflow = last3.every((b) => (b.realBuyVolume ?? 0) > (b.realSellVolume ?? 0));
        if (allInflow) {
          const ratios = last3.map((b) =>
            (b.realSellVolume ?? 0) > 0 ? (b.realBuyVolume ?? 0) / (b.realSellVolume ?? 1) : 2
          );
          const avgRatio = ratios.reduce((s, x) => s + x, 0) / ratios.length;
          const strength: SignalStrength = avgRatio >= 1.4 ? 'strong' : avgRatio >= 1.15 ? 'medium' : 'weak';
          allSignals.push({
            symbol: ds.symbol,
            nameFa: ds.nameFa,
            assetType: ds.assetType,
            signalCode: 'real_money_inflow_3d',
            signalTitleFa: 'ورود پول حقیقی (۳ روز متوالی)',
            exactValueFa: `نسبت میانگین خرید به فروش حقیقی: ${avgRatio.toFixed(2)} برابر`,
            strength,
            sourceName: ds.fileName || ds.sourceName,
            dataDate: latest.date,
            formulaFa: 'خرید حقیقی > فروش حقیقی در ۳ روز معاملاتی متوالی آخر'
          });
        }
      } else {
        missingDataNotes.push(`${ds.symbol}: داده خرید/فروش حقیقی برای ۳ روز آخر موجود نیست.`);
      }
    }

    // ۲) جهش حجم معاملات (> ۲ برابر میانگین ۲۰ روزه)
    if (bars.length >= 21) {
      const prev20 = bars.slice(-21, -1);
      const avgVol20 = prev20.reduce((s, b) => s + b.volume, 0) / 20;
      if (avgVol20 > 0) {
        const volRatio = latest.volume / avgVol20;
        if (volRatio > 2) {
          const strength: SignalStrength = volRatio >= 3.5 ? 'strong' : volRatio >= 2.5 ? 'medium' : 'weak';
          allSignals.push({
            symbol: ds.symbol,
            nameFa: ds.nameFa,
            assetType: ds.assetType,
            signalCode: isFund ? 'fund_liquidity_surge' : 'volume_spike_2x',
            signalTitleFa: isFund ? 'جهش حجم و نقدشوندگی صندوق' : 'جهش حجم معاملات',
            exactValueFa: `${volRatio.toFixed(2)} برابر میانگین ۲۰ روزه`,
            strength,
            sourceName: ds.fileName || ds.sourceName,
            dataDate: latest.date,
            formulaFa: 'حجم روز جاری ÷ میانگین حجم ۲۰ روز گذشته > ۲'
          });
        }
      }

      // ۳) شکست مقاومت ۲۰ روزه (پایانی امروز > سقف ۲۰ روز گذشته بدون لحاظ امروز)
      const high20 = Math.max(...prev20.map((b) => Math.max(b.high, b.close)));
      if (high20 > 0 && latest.close > high20) {
        const breakoutPct = ((latest.close - high20) / high20) * 100;
        const strength: SignalStrength = breakoutPct >= 3 ? 'strong' : breakoutPct >= 1 ? 'medium' : 'weak';
        allSignals.push({
          symbol: ds.symbol,
          nameFa: ds.nameFa,
          assetType: ds.assetType,
          signalCode: 'breakout_20d',
          signalTitleFa: 'شکست مقاومت ۲۰ روزه',
          exactValueFa: `+${breakoutPct.toFixed(2)}٪ بالای سقف ۲۰ روزه (${Math.round(high20).toLocaleString('en-US')})`,
          strength,
          sourceName: ds.fileName || ds.sourceName,
          dataDate: latest.date,
          formulaFa: 'قیمت پایانی امروز > بیشترین قیمت ۲۰ روز قبل (بدون لحاظ امروز)'
        });
      }
    } else {
      missingDataNotes.push(`${ds.symbol}: برای بررسی جهش حجم و شکست مقاومت به حداقل ۲۱ روز سابقه قیمت نیاز است (فعلاً ${bars.length} روز).`);
    }

    // ۵) سیگنال اختصاصی صندوق‌ها: فاصله قیمت بازار با NAV (تخفیف یا حباب)
    if (isFund && latest.nav && latest.nav > 0) {
      const premiumPct = ((latest.close - latest.nav) / latest.nav) * 100;
      if (premiumPct <= -2) {
        allSignals.push({
          symbol: ds.symbol,
          nameFa: ds.nameFa,
          assetType: ds.assetType,
          signalCode: 'fund_nav_discount',
          signalTitleFa: 'معامله صندوق زیر NAV (تخفیف)',
          exactValueFa: `${premiumPct.toFixed(2)}٪ زیر NAV ابطال (${Math.round(latest.nav).toLocaleString('en-US')})`,
          strength: premiumPct <= -5 ? 'strong' : 'medium',
          sourceName: ds.fileName || ds.sourceName,
          dataDate: latest.date,
          formulaFa: '(قیمت پایانی − NAV) ÷ NAV × ۱۰۰'
        });
      } else if (premiumPct >= 4) {
        allSignals.push({
          symbol: ds.symbol,
          nameFa: ds.nameFa,
          assetType: ds.assetType,
          signalCode: 'fund_nav_bubble',
          signalTitleFa: 'هشدار حباب مثبت صندوق نسبت به NAV',
          exactValueFa: `+${premiumPct.toFixed(2)}٪ بالاتر از NAV (${Math.round(latest.nav).toLocaleString('en-US')})`,
          strength: premiumPct >= 8 ? 'strong' : 'medium',
          sourceName: ds.fileName || ds.sourceName,
          dataDate: latest.date,
          formulaFa: '(قیمت پایانی − NAV) ÷ NAV × ۱۰۰'
        });
      }
    }
  }

  // ۴) بررسی اطلاعیه‌های مهم کدال بارگذاری‌شده
  const targetDocs = params.documents.filter((doc) => !filterSet || filterSet.has(doc.symbol));
  for (const doc of targetDocs) {
    const txt = `${doc.title} ${doc.extractedText}`;
    const matched = MATERIAL_CODAL_PATTERNS.find((p) => p.re.test(txt));
    if (matched) {
      const dsMatch = params.datasets.find((d) => d.symbol === doc.symbol);
      allSignals.push({
        symbol: doc.symbol,
        nameFa: dsMatch?.nameFa ?? doc.symbol,
        assetType: dsMatch?.assetType ?? 'stock',
        signalCode: 'codal_material',
        signalTitleFa: 'اطلاعیه مهم کدال',
        exactValueFa: `${matched.label}: ${doc.title}`,
        strength: /افزایش\s*سرمایه|گروه\s*الف|قرارداد\s*مهم/.test(txt) ? 'strong' : 'medium',
        sourceName: doc.fileName || 'کدال',
        dataDate: doc.reportDate,
        formulaFa: 'پایش کلیدواژه‌های بااهمیت در متن اطلاعیه کدال بارگذاری‌شده'
      });
    }
  }

  // رتبه‌بندی نمادها بر اساس مجموع قدرت سیگنال و انتخاب حداکثر ۵ نماد برتر
  const symbolScore = new Map<string, number>();
  for (const row of allSignals) {
    symbolScore.set(row.symbol, (symbolScore.get(row.symbol) ?? 0) + STRENGTH_SCORE[row.strength]);
  }
  const topSymbols = new Set(
    [...symbolScore.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxTop)
      .map(([sym]) => sym)
  );

  const rows = allSignals
    .filter((r) => topSymbols.has(r.symbol))
    .sort((a, b) => STRENGTH_SCORE[b.strength] - STRENGTH_SCORE[a.strength]);

  return {
    executedAt: Date.now(),
    scannedSymbolsCount: targetDatasets.length,
    rows,
    emptyMessageFa:
      rows.length === 0 ? 'در داده‌های بررسی‌شده، نمادی که شرایط تعریف‌شده را داشته باشد پیدا نشد.' : null,
    missingDataNotes
  };
}
