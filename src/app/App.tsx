import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense, useState } from 'react';
import { AppShell } from '@/app/providers/AppProviders';
import { MarketsHomePage } from '@/features/market/presentation/MarketsHomePage';
import { PageSkeleton } from '@/shared/components/ui/Skeleton';
import { AuthBootstrap, AuthGate } from '@/features/auth/AuthGate';

// ⚠️ فقط صفحه اصلی (بازار) مستقیم import می‌شود — بقیه lazy تا باندل
// اولیه سبک بماند و اپ زود بالا بیاید (تغییر اساسی برای روان‌سازی)
const DashboardPage = lazy(() => import('@/features/eth-summary/presentation/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const MarketPerformancePage = lazy(() => import('@/features/cryptomarkets/presentation/MarketPerformancePage').then((m) => ({ default: m.MarketPerformancePage })));
const SimulationPage = lazy(() => import('@/features/simulation/presentation/SimulationPage').then((m) => ({ default: m.SimulationPage })));
const DeFiPage = lazy(() => import('@/features/defi/presentation/DeFiPage').then((m) => ({ default: m.DeFiPage })));
const CarMarketPage = lazy(() => import('@/features/carMarket/presentation/CarMarketPage').then((m) => ({ default: m.CarMarketPage })));
const PropertyMarketPage = lazy(() => import('@/features/propertyMarket/presentation/PropertyMarketPage').then((m) => ({ default: m.PropertyMarketPage })));
const CalculatorsPage = lazy(() => import('@/features/calculators/presentation/CalculatorsPage').then((m) => ({ default: m.CalculatorsPage })));
const HoldingsPage = lazy(() => import('@/features/custody/presentation/HoldingsPage'));
const ArcusPage = lazy(() => import('@/features/arcus/presentation/ArcusPage'));
const ConnectedPage = lazy(() => import('@/features/connected/presentation/ConnectedPage'));
const AssistantPage = lazy(() => import('@/features/connected/presentation/AssistantPage'));
const SecurityPage = lazy(() => import('@/features/auth/SecurityPage'));
const BorosPage = lazy(() => import('@/features/boros/presentation/BorosDashboard'));
const DesignSystemPage = lazy(() => import('@/features/design-system/DesignSystemPage'));

/** صفحهٔ «دارایی من» — فقط پس از ورود با Passkey (کنترل واقعی روی سرور است) */
function Private({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <AuthGate>
      <Lazy label={label}>{children}</Lazy>
    </AuthGate>
  );
}

/** Suspense مشترک برای همه صفحات lazy — اسکلتون هم‌ریتم صفحه (نه اسپلش لوگو) */
function Lazy({ children, label }: { children: React.ReactNode; label?: string }) {
  return <Suspense fallback={<PageSkeleton label={label} />}>{children}</Suspense>;
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
        <AuthBootstrap />
        <Routes>
          <Route path="/" element={<MarketsHomePage />} />
          <Route path="/market" element={<MarketsHomePage />} />
          <Route
            path="/dashboard"
            element={
              <Private>
                <DashboardPage />
              </Private>
            }
          />
          <Route path="/market-performance" element={<Lazy><MarketPerformancePage /></Lazy>} />
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
            path="/calculators"
            element={
              <Lazy>
                <CalculatorsPage />
              </Lazy>
            }
          />
          <Route
            path="/accounting"
            element={<Navigate to="/dashboard" replace/>}
          />
          <Route
            path="/holdings"
            element={
              <Private label="دارایی‌های چندشبکه‌ای">
                <HoldingsPage />
              </Private>
            }
          />
          <Route
            path="/arcus"
            element={
              <Private label="آرکوس">
                <ArcusPage />
              </Private>
            }
          />
          <Route
            path="/security"
            element={
              <Private label="امنیت و دستگاه‌ها">
                <SecurityPage />
              </Private>
            }
          />
          <Route
            path="/boros"
            element={
              <Lazy label="تحلیل بوروس">
                <BorosPage />
              </Lazy>
            }
          />
          <Route
            path="/vehicle"
            element={
              <Lazy label="بازار خودرو">
                <CarMarketPage />
              </Lazy>
            }
          />
          <Route
            path="/realestate"
            element={
              <Lazy label="بازار املاک">
                <PropertyMarketPage />
              </Lazy>
            }
          />
          <Route
            path="/property-market"
            element={
              <Lazy label="بازار املاک">
                <PropertyMarketPage />
              </Lazy>
            }
          />
          <Route
            path="/design-system"
            element={
              <Lazy label="سیستم طراحی">
                <DesignSystemPage />
              </Lazy>
            }
          />
          <Route path="/wallets" element={<Private label="مدیریت کیف پول‌ها"><ConnectedPage /></Private>} />
          <Route path="/assistant" element={<Private label="دستیار پرتفولیو"><AssistantPage /></Private>} />
          <Route path="*" element={<MarketsHomePage />} />
        </Routes>
      </AppShell>
    </HashRouter>
  );
}
