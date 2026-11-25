/**
 * میز معامله — معماری خلوت ۴-تبه (پس از لوپ نقد حذف هم‌پوشانی تب‌ها):
 *   ۱) تصمیم واحد: مرکز تصمیم‌گیری یکپارچه (حکم واحد + خرید پله‌ای EOM + سایزینگ ریسک)
 *   ۲) مناظره ایجنت‌ها: تحلیل عمیق هوش مصنوعی Bull/Bear برای رمزارز، سهام (NVDA…)، طلا و نفت
 *   ۳) تریدرها و مشتقات: تریدرهای برتر، اجماع پوزیشن‌ها و تابلوی مشتقات/فاندینگ در یک تب
 *   ۴) میم‌کوین و امنیت: غربال میم‌کوین‌ها و بررسی امنیت قرارداد توکن
 *
 * نکته: مسیرهای عمیق‌تر «همه فرصت‌های سوینگ» (?tab=swing) و «مقایسه ۱۹ بازار EOM» (?tab=eom)
 * همچنان از دکمه‌های داخل تصمیم واحد با نوار بازگشت تمیز در دسترس‌اند.
 */
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, ArrowRight, Bot, Flame, Layers, ShieldCheck, Trophy } from 'lucide-react';
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { Button } from '@/shared/components/ui/Button';
import { SegmentedControl, Tabs } from '@/shared/components/ui/SegmentedControl';
import { useAuth } from '@/features/auth/authClient';
import { isHlAddress } from '@/features/traders/domain/candidates';
import { useSavedTraders } from '@/features/traders/data/savedTraders';
import { useTradersList } from '@/features/traders/data/useTraders';
import { TradersTab } from '@/features/traders/presentation/TradersTab';
import { TraderReportSheet } from '@/features/traders/presentation/TraderReportSheet';
import { UnifiedDeskTab } from './UnifiedDeskTab';
import { SwingTab } from './SwingTab';
import { PositionsTab } from './PositionsTab';
import { DerivativesTab } from './DerivativesTab';
import { MemesTab } from './MemesTab';
import { SafetyTab } from './SafetyTab';
import { TradingAgentsTab } from './TradingAgentsTab';
import { EomSetupTab } from './EomSetupTab';
import { CoinSheet } from './CoinSheet';
import { TokenSheet } from './TokenSheet';

type PrimaryTab = 'unified' | 'agents' | 'traders' | 'memes';
type DrilldownView = 'swing' | 'eom' | null;

export default function IntelHubPage() {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab');

  const drilldown: DrilldownView = rawTab === 'swing' ? 'swing' : rawTab === 'eom' ? 'eom' : null;

  const primaryTab: PrimaryTab =
    rawTab === 'agents'
      ? 'agents'
      : rawTab === 'traders' || rawTab === 'positions' || rawTab === 'derivs'
        ? 'traders'
        : rawTab === 'memes' || rawTab === 'safety'
          ? 'memes'
          : 'unified';

  const traderSubView: 'top' | 'consensus' | 'mine' | 'derivs' =
    rawTab === 'derivs' || params.get('view') === 'derivs'
      ? 'derivs'
      : rawTab === 'positions' || params.get('view') === 'consensus'
        ? 'consensus'
        : params.get('view') === 'mine'
          ? 'mine'
          : 'top';

  const memeView = rawTab === 'safety' || params.get('view') === 'safety' ? 'safety' : 'screen';
  const trader = params.get('a');
  const coin = params.get('coin');
  const token = params.get('token');
  const market = params.get('m') ?? 'BTC';
  const authStatus = useAuth((s) => s.status);
  const hydrate = useSavedTraders((s) => s.hydrate);
  const saved = useSavedTraders((s) => s.saved);
  const list = useTradersList();

  useEffect(() => {
    if (authStatus === 'unknown') return;
    const run = () => void hydrate(authStatus === 'authenticated');
    run();
    const onVisible = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [authStatus, hydrate]);

  const update = (patch: Record<string, string | null>) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      for (const [k, v] of Object.entries(patch)) v === null ? next.delete(k) : next.set(k, v);
      return next;
    });

  const traderName = trader
    ? list.data?.candidates.find((c) => c.address === trader)?.displayName ??
      saved.find((s) => s.address === trader)?.label ??
      null
    : null;

  return (
    <Page>
      <PageHeader
        title="میز معامله"
        subtitle="تصمیم‌گیری شفاف و یکپارچه برای رمزارزها (BTC، SOL، HYPE) و سهام جهانی (NVDA…)"
      />

      <Tabs<PrimaryTab>
        className="mb-5"
        label="بخش‌های میز معامله"
        value={primaryTab}
        onChange={(v) => update({ tab: v === 'unified' ? null : v, view: null })}
        options={[
          { value: 'unified', label: 'تصمیم واحد', icon: <Layers /> },
          { value: 'agents', label: 'مناظره ایجنت‌ها', icon: <Bot /> },
          { value: 'traders', label: 'تریدرها و مشتقات', icon: <Trophy /> },
          { value: 'memes', label: 'میم‌کوین و امنیت', icon: <Flame /> }
        ]}
      />

      <div role="tabpanel">
        {drilldown === 'swing' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-divider/80 bg-surface-2/45 px-3.5 py-2.5">
              <span className="text-xs font-bold text-ink">نمای کامل فرصت‌های بازار و رژیم سوینگ</span>
              <Button
                size="sm"
                variant="outline"
                icon={<ArrowRight className="h-3.5 w-3.5" />}
                onClick={() => update({ tab: null, view: null })}
              >
                بازگشت به تصمیم واحد
              </Button>
            </div>
            <SwingTab
              onAnalyzeWithAgents={(c) => update({ tab: 'agents', view: null, m: c })}
              onOpenEom={() => update({ tab: 'eom', view: null })}
            />
          </div>
        )}

        {drilldown === 'eom' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-divider/80 bg-surface-2/45 px-3.5 py-2.5">
              <span className="text-xs font-bold text-ink">مقایسه کامل ستاپ پایان ماه (۱۹ بازار جهانی)</span>
              <Button
                size="sm"
                variant="outline"
                icon={<ArrowRight className="h-3.5 w-3.5" />}
                onClick={() => update({ tab: null, view: null })}
              >
                بازگشت به تصمیم واحد
              </Button>
            </div>
            <EomSetupTab />
          </div>
        )}

        {!drilldown && primaryTab === 'unified' && (
          <UnifiedDeskTab
            selectedMarket={market}
            onChangeMarket={(m) => update({ m })}
            onOpenAgents={(c) => update({ tab: 'agents', view: null, m: c })}
            onOpenSwing={() => update({ tab: 'swing', view: null })}
            onOpenEom={() => update({ tab: 'eom', view: null })}
          />
        )}

        {!drilldown && primaryTab === 'agents' && (
          <TradingAgentsTab
            market={market}
            onChangeMarket={(m) => update({ m })}
            onSelectCoin={(c) => update({ coin: c })}
          />
        )}

        {!drilldown && primaryTab === 'traders' && (
          <div className="space-y-4">
            <SegmentedControl<'traders' | 'derivs'>
              label="تریدرها یا بازار مشتقات"
              size="sm"
              value={traderSubView === 'derivs' ? 'derivs' : 'traders'}
              onChange={(v) =>
                update({ tab: 'traders', view: v === 'derivs' ? 'derivs' : null })
              }
              options={[
                { value: 'traders', label: 'تریدرهای برتر و اجماع', icon: <Trophy /> },
                { value: 'derivs', label: 'بازار مشتقات و فاندینگ', icon: <Activity /> }
              ]}
            />
            {traderSubView === 'derivs' ? (
              <DerivativesTab onCoin={(c) => update({ coin: c })} />
            ) : (
              <TradersTab
                view={traderSubView}
                onView={(v) => update({ tab: 'traders', view: v === 'top' ? null : v })}
                onOpen={(a) => update({ a })}
                consensus={<PositionsTab onCoin={(c) => update({ coin: c })} />}
              />
            )}
          </div>
        )}

        {!drilldown && primaryTab === 'memes' && (
          <div className="space-y-4">
            <SegmentedControl<'screen' | 'safety'>
              label="میم‌کوین یا امنیت توکن"
              value={memeView}
              onChange={(v) => update({ tab: 'memes', view: v === 'screen' ? null : v })}
              options={[
                { value: 'screen', label: 'غربال میم‌کوین', icon: <Flame /> },
                { value: 'safety', label: 'امنیت یک توکن', icon: <ShieldCheck /> }
              ]}
            />
            {memeView === 'safety' ? <SafetyTab /> : <MemesTab onToken={(t) => update({ token: t })} />}
          </div>
        )}
      </div>

      <TraderReportSheet
        address={trader && isHlAddress(trader) ? trader : null}
        name={traderName}
        onClose={() => update({ a: null })}
      />
      <CoinSheet
        coin={coin && /^[A-Za-z0-9:_-]{1,30}$/.test(coin) ? coin : null}
        onClose={() => update({ coin: null })}
        onTrader={(a) => update({ coin: null, a })}
      />
      <TokenSheet
        address={token && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token) ? token : null}
        onClose={() => update({ token: null })}
      />
    </Page>
  );
}
