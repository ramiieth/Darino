import { HashRouter, Routes, Route } from 'react-router-dom';
import { lazy, Suspense, useState } from 'react';
import { AppShell } from '@/app/providers/AppProviders';
import { MarketsHomePage } from '@/features/market/presentation/MarketsHomePage';
import { BrandSplash } from '@/shared/components/brand/DarinoLogo';

// ⚠️ فقط صفحه اصلی (بازار) مستقیم import می‌شود — بقیه lazy تا باندل
// اولیه سبک بماند و اپ زود بالا بیاید (تغییر اساسی برای روان‌سازی)
const DashboardPage = lazy(() => import('@/features/eth-summary/presentation/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const SimulationPage = lazy(() => import('@/features/simulation/presentation/SimulationPage').then((m) => ({ default: m.SimulationPage })));
const DeFiPage = lazy(() => import('@/features/defi/presentation/DeFiPage').then((m) => ({ default: m.DeFiPage })));
const VehiclePage = lazy(() => import('@/features/vehicle/presentation/VehiclePage').then((m) => ({ default: m.VehiclePage })));
const RealEstatePage = lazy(() => import('@/features/realestate/presentation/RealEstatePage').then((m) => ({ default: m.RealEstatePage })));
const PendlePage = lazy(() => import('@/features/pendle/presentation/PendlePage').then((m) => ({ default: m.PendlePage })));
const PendleMarketDetailPage = lazy(() => import('@/features/pendle/presentation/PendleMarketDetailPage').then((m) => ({ default: m.PendleMarketDetailPage })));
const CalculatorsPage = lazy(() => import('@/features/calculators/presentation/CalculatorsPage').then((m) => ({ default: m.CalculatorsPage })));
const AccountingPage = lazy(() => import('@/features/accounting/presentation/AccountingPage'));
const BorosPage = lazy(() => import('@/features/boros/presentation/BorosDashboard'));
const LoopPage = lazy(() => import('@/features/defi-loop/presentation/LoopAnalysisPage'));

/** Suspense مشترک برای همه صفحات lazy */
function Lazy({ children, label }: { children: React.ReactNode; label?: string }) {
  return <Suspense fallback={<BrandSplash label={label} />}>{children}</Suspense>;
}

export function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <HashRouter>
      <AppShell
        settingsOpen={settingsOpen}
        onOpenSettings={() => setSettingsOpen(true)}
        onCloseSettings={() => setSettingsOpen(false)}
      >
        <Routes>
          <Route path="/" element={<MarketsHomePage />} />
          <Route path="/market" element={<MarketsHomePage />} />
          <Route
            path="/dashboard"
            element={
              <Lazy>
                <DashboardPage />
              </Lazy>
            }
          />
          <Route
            path="/simulation"
            element={
              <Lazy>
                <SimulationPage onOpenScenario={() => setSettingsOpen(true)} />
              </Lazy>
            }
          />
          <Route
            path="/defi"
            element={
              <Lazy>
                <DeFiPage />
              </Lazy>
            }
          />
          <Route
            path="/pendle"
            element={
              <Lazy>
                <PendlePage />
              </Lazy>
            }
          />
          <Route
            path="/pendle/:chainId/:address"
            element={
              <Lazy>
                <PendleMarketDetailPage />
              </Lazy>
            }
          />
          <Route
            path="/calculators"
            element={
              <Lazy>
                <CalculatorsPage />
              </Lazy>
            }
          />
          <Route
            path="/accounting"
            element={
              <Lazy label="حسابداری">
                <AccountingPage />
              </Lazy>
            }
          />
          <Route
            path="/boros"
            element={
              <Lazy label="تحلیل Boros">
                <BorosPage />
              </Lazy>
            }
          />
          <Route
            path="/vehicle"
            element={
              <Lazy label="خودرو">
                <VehiclePage />
              </Lazy>
            }
          />
          <Route
            path="/realestate"
            element={
              <Lazy label="ملک">
                <RealEstatePage />
              </Lazy>
            }
          />
          <Route
            path="/defi-loop"
            element={
              <Lazy label="Yield Loop">
                <LoopPage />
              </Lazy>
            }
          />
          <Route path="*" element={<MarketsHomePage />} />
        </Routes>
      </AppShell>
    </HashRouter>
  );
}
