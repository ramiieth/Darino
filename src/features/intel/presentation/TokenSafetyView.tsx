/**
 * کارنامهٔ امنیت یک توکن — حکم، پرچم‌ها به ترتیب شدت، بازار و هولدرها، لینک‌های بررسی بیشتر
 */
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { cn } from '@/shared/lib/cn';
import { toFaDigits } from '@/shared/utils/formatters';
import { CHAIN_FA, type Chain, type FlagLevel, type TokenSafety } from '../domain/tokenSafety';
import { LinkPill, Stat, VERDICT, fmtAge, fmtPrice } from './parts';

const EXPLORER: Record<Chain, (a: string) => string> = {
  solana: (a) => `https://solscan.io/token/${a}`,
  ethereum: (a) => `https://etherscan.io/token/${a}`,
  base: (a) => `https://basescan.org/token/${a}`,
  bsc: (a) => `https://bscscan.com/token/${a}`,
  arbitrum: (a) => `https://arbiscan.io/token/${a}`
};

const FLAG_STYLE: Record<FlagLevel, { icon: typeof Info; cls: string }> = {
  critical: { icon: ShieldAlert, cls: 'text-negative' },
  warn: { icon: AlertTriangle, cls: 'text-warn' },
  info: { icon: Info, cls: 'text-subtle' },
  ok: { icon: CheckCircle2, cls: 'text-positive' }
};

const SCORE: Record<TokenSafety['verdict'], string> = { danger: 'text-negative', caution: 'text-warn', clear: 'text-positive', unknown: 'text-subtle' };

const RING: Record<TokenSafety['verdict'], string> = {
  danger: 'border-loss/40 bg-loss/5',
  caution: 'border-warn/40 bg-warn/5',
  clear: 'border-gain/40 bg-gain/5',
  unknown: 'border-divider bg-surface-2/60'
};

export function TokenSafetyView({ t }: { t: TokenSafety }) {
  const v = VERDICT[t.verdict];
  const m = t.market;
  return (
    <div className="space-y-5">
      <div className={cn('flex items-center gap-4 rounded-card border p-4', RING[t.verdict])}>
        <div className={cn('flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-4 border-current bg-card', SCORE[t.verdict])} aria-label={`امتیاز ${t.score} از ۱۰۰`}>
          <span className="text-xl font-extrabold leading-none text-ink">{toFaDigits(t.score)}</span>
          <span className="text-[10px] text-muted">از ۱۰۰</span>
        </div>
        <div className="min-w-0">
          <p className="text-lg font-extrabold text-ink">{v.label}</p>
          <p className="mt-0.5 truncate text-sm text-muted">
            {t.symbol ? <bdi dir="ltr" className="font-semibold text-ink">{t.symbol}</bdi> : 'توکن'} {t.name && <span>· {t.name}</span>} · {CHAIN_FA[t.chain]}
          </p>
          <p className="mt-1 text-2xs text-subtle">منابع: {t.sources.join('، ') || 'هیچ منبعی پاسخ نداد'}</p>
        </div>
      </div>

      {t.flags.length > 0 && (
        <ul className="divide-y divide-divider rounded-card border border-divider bg-card">
          {t.flags.map((f, i) => {
            const S = FLAG_STYLE[f.level];
            return (
              <li key={i} className="flex gap-3 px-4 py-3">
                <S.icon className={cn('mt-0.5 h-4 w-4 shrink-0', S.cls)} aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{f.label}</p>
                  {f.detail && <p className="mt-0.5 text-xs leading-5 text-muted">{f.detail}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Surface variant="subtle" className="grid grid-cols-2 gap-x-4 gap-y-4 p-4 sm:grid-cols-4">
        <Stat label="قیمت">{m?.priceUsd != null ? <span className="persian-amount inline-flex items-baseline gap-1"><bdi dir="ltr" className="num-ltr">{fmtPrice(m.priceUsd)}</bdi><span className="text-[0.62em] font-medium opacity-70">دلار</span></span> : '—'}</Stat>
        <Stat label="نقدینگی"><MoneyValue value={m?.liquidityUsd} compact /></Stat>
        <Stat label="ارزش بازار"><MoneyValue value={m?.marketCap ?? m?.fdv} compact /></Stat>
        <Stat label="حجم ۲۴ ساعت"><MoneyValue value={m?.volume24h} compact /></Stat>
        <Stat label="تغییر ۲۴ ساعت"><PercentValue value={m?.change24h} digits={1} /></Stat>
        <Stat label="عمر جفت">{fmtAge(m?.createdAt ?? null)}</Stat>
        <Stat label="۱۰ هولدر برتر">{t.top10Pct === null ? '—' : `${toFaDigits(Math.round(t.top10Pct))}٪`}</Stat>
        <Stat label="نقدینگی قفل‌شده">{t.lpLockedPct === null ? '—' : `${toFaDigits(Math.round(t.lpLockedPct))}٪`}</Stat>
        <Stat label="تعداد هولدر">{t.holderCount === null ? '—' : toFaDigits(t.holderCount.toLocaleString('en-US'))}</Stat>
        <Stat label="خرید / فروش ۲۴ ساعت">{m?.buys24h != null && m.sells24h != null ? `${toFaDigits(m.buys24h.toLocaleString('en-US'))} / ${toFaDigits(m.sells24h.toLocaleString('en-US'))}` : '—'}</Stat>
      </Surface>

      <div className="flex flex-wrap gap-2">
        {m?.url && <LinkPill href={m.url}>DexScreener</LinkPill>}
        <LinkPill href={EXPLORER[t.chain](t.address)}>اکسپلورر</LinkPill>
        {t.chain === 'solana' && <LinkPill href={`https://rugcheck.xyz/tokens/${t.address}`}>RugCheck</LinkPill>}
        <LinkPill href={`https://gopluslabs.io/token-security/${t.chain === 'solana' ? 'solana' : { ethereum: '1', base: '8453', bsc: '56', arbitrum: '42161' }[t.chain]}/${t.address}`}>GoPlus</LinkPill>
      </div>
      <p className="text-xs leading-6 text-subtle">
        «خطر شناخته‌شده‌ای پیدا نشد» یعنی این منابع مشکلی ثبت نکرده‌اند، نه این‌که توکن امن است. میم‌کوین‌ها بسیار پرریسک‌اند. توصیهٔ مالی نیست.
      </p>
    </div>
  );
}
