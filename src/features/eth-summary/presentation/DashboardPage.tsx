/** Dashboard contains only the connected real portfolio. */
import { PageHeader, Page } from '@/shared/components/layout/Page';
import { PortfolioSummary } from '@/features/connected/presentation/PortfolioSummary';
import { useConnectedPortfolio } from '@/features/connected/data/useConnectedPortfolio';
import { useCustodySync } from '@/features/custody/data/sync';

export function DashboardPage() {
  useCustodySync();
  const portfolio = useConnectedPortfolio();
  return (
    <Page>
      <PageHeader title="داشبورد" subtitle="دارایی‌ها، ارزش روز و فعالیت‌های کیف پول‌های شما" />
      <PortfolioSummary portfolio={portfolio} />
    </Page>
  );
}
