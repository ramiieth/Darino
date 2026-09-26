# Darino — UI/UX Design Audit

Date: 2026-09-26 · Scope: every user-facing route, the app shell, shared UI primitives, PWA shell.
Method: full source read of `src/app`, `src/shared`, every `features/*/presentation` file, `tailwind.config.js`,
`src/styles/index.css`, `vite.config.ts` (PWA), `index.html`; production build + test baseline.

Code is the source of truth; the README was not relied on.

---

## 0. Baseline measurements (before redesign)

| Measure | Value |
|---|---|
| Routes | 13 paths → 12 screens (`/`, `/market`, `/dashboard`, `/simulation`, `/defi`, `/pendle`, `/pendle/:chainId/:address`, `/calculators`, `/accounting`, `/boros`, `/vehicle`, `/realestate` = `/property-market`, `/defi-loop`, `*`) |
| Presentation files | 70 `.tsx` files, ~12.9k lines |
| Arbitrary font sizes | **832** `text-[Npx]` usages: 7px ×6, **8px ×116, 9px ×182**, 10px ×223, 11px ×189, 12px ×58, 13px ×32, 14–40px ×26 |
| Font weights | `font-black` (900) ×259, `font-extrabold` ×106, `font-bold` ×400, `font-medium` ×150, `font-semibold` ×4 |
| Radii | `rounded-lg` ×141, `rounded-xl` ×111, `rounded-2xl` ×88, `rounded-full` ×60, `rounded-md` ×7, `rounded` ×6 |
| Raw palette colours (bypassing tokens) | 72 usages (`emerald-*`, `rose-*`, `amber-*`, `sky-*`, `violet-*`, `teal-*`, `indigo-*`) in 18 files + 20 hard-coded hex values in charts |
| `GlassCard` instances | 150+ across 51 files (Pendle analytics alone: 12) |
| Native `<select>` with ad-hoc styling | 29 in 14 files, 4 different visual treatments |
| framer-motion | 12 files, used only for fade/slide-in; ships a 111 kB (37 kB gz) chunk |
| Main JS chunk | 769 kB (249 kB gz) |
| PWA precache | 97 entries / 2.40 MB (includes every Vazirmatn weight 400–900 in both woff2 **and** woff) |
| Tests | 744 total, **3 failing before any change** (Boros domain fixtures with maturities now in the past — time-dependent; domain code, out of scope) |

---

## 1. Current information architecture

```
بازار (/)                       Markets: 4 tabs (all / crypto / tokenized / tradfi) + in-table source chips + Pendle link card
داشبورد (/dashboard)            Net-worth hero · ETH card · Pendle "Real APY" card · watchlist · top performers (30+30 rows)
                                · hypothetical-investment card (30+30 rows) · 2 links to simulation
دیفای (/defi)                   4 tabs: capital flow (5 sub-tabs) · link to Yield Loop · overview · stablecoins
Pendle (/pendle)                3 tabs: markets (5 sub-filters) · opportunities · analytics (6 calculators)
  └ /pendle/:chain/:addr        Market detail
Boros (/boros)                  5 tabs: opportunities · compare · simulator · risk monitor · audit
Yield Loop (/defi-loop)         Explorer + calculator
شبیه‌سازی (/simulation)          2 timelines, analytics cards, chart, filters, 100+ row table, row detail sheet
ماشین‌حساب (/calculators)        5 tabs: PnL · DCA · CAGR · XIRR · compare
حسابداری (/accounting)           7 tabs: trade · expense · deposit · journal · ledger · P/L · audit
خودرو (/vehicle)                Vehicle-as-asset analytics + snapshot sheet
املاک (/realestate)             Ahvaz property market (Divar collector, scenarios, charts)
Settings                        Global sheet (scenario, FX rate)
Command palette                 ⌘K asset search → navigates to Markets
```

Findings:

* **The first route is Markets, not the portfolio.** The Dashboard — the only place that answers "what do I own / what is it worth" — is the second destination. The app name promises personal asset management; the shell promises a market screener.
* **Destinations are organised by data provider, not by user goal.** DeFi, Pendle, Boros and Yield Loop are four siblings; the DeFi page contains a tab whose only content is a link to Yield Loop; Markets contains a card linking to Pendle. Users meet the same concept (yield) in four places.
* **Accounting mixes actions and records at the same level.** Seven tabs place "buy/sell", "withdraw", "deposit" (actions) next to "journal", "ledger", "P/L", "audit" (records). There is no overview of balances before the user is asked to act.
* **Dashboard has no hierarchy.** Seven modules stacked at equal weight; two of them render 60 rows each. The ETH card duplicates the hero; the Pendle card sits above the user's own watchlist.

## 2. Current navigation architecture

| Surface | Implementation | Problems |
|---|---|---|
| Desktop sidebar (`Sidebar.tsx`, lg+) | 4 groups, 11 items, collapsible 248 ↔ 76 px | Brand teal active state; labels 12px; no utility area; order starts with Markets |
| Mobile bottom nav (`BottomNav.tsx`, < lg) | 4 items + "More" sheet with 7 items | Shown on tablets up to 1023 px (iPad landscape gets a phone bar); 10px labels; destination list duplicated from sidebar (3 copies of nav config incl. palette) |
| Top bar (`TopBar.tsx`) | Title derived from `window.location.hash.includes(...)` | Fragile: `/defi-loop` → "دیفای", `/pendle` → app name, `/boros` → app name, `/market` substring also matches `/property-market`. It renders an `<h1>` **and** every page renders its own `<PageHeader>` `<h1>` — 2–3 H1s per page (Markets has three: top bar, PageHeader "بازار", MarketsPage "بازار") |
| Command palette | Asset search only; always routes to Markets | Cannot jump to pages; no `role="listbox"`/`aria-activedescendant` |
| Back navigation | Only Pendle detail has an in-page back link | PWA standalone (no browser chrome) has no back affordance on detail screens |

## 3. Current design system

There is no documented design system in the repo. `public/brand-sheet.html` documents the **logo only** (navy #0B2545 → emerald #10B981). The implemented UI uses a **teal** accent (`--c-accent: 13 110 101`) that matches neither the logo sheet nor the supplied reference (brand blue #2E5BFF). Glassmorphism was previously removed but its vocabulary survives (`GlassCard`, `.glass`, `.glass-soft`, `.glass-inset`).

## 4. Current token system

`index.css` defines 12 RGB channel variables (surface, surface-2, card, line, ink, muted, accent, accent-soft, positive, negative, warn, info) for light and dark, consumed through Tailwind colour aliases. This is a sound mechanism and is **kept**; the values and coverage are the problem:

| Area | State |
|---|---|
| Colour | No brand scale, no gold, no subtle ink, no semantic divider; `line` is always used with ad-hoc alpha (`/5`, `/6`, `/8`, `/10`, `/12`, `/15`, `/20`, `/25`) — 8 different border strengths |
| Typography | Tailwind scale overridden to 11/13/15/17 px, then bypassed 832 times with arbitrary pixel sizes; 32% of all text is ≤ 9px |
| Spacing | Tailwind 4px scale — fine, but page gutters (16/24/32) and section gaps (`space-y-2 … space-y-6`) are chosen per file |
| Radius | Reference scale (8/12/16/24) is technically available (`lg/xl/2xl/3xl`) but used arbitrarily: cards are 12 or 16, inputs 8/12/16, chips 8 or full |
| Elevation | 5 shadows incl. `shadow-glow` and `shadow-accent` (coloured glows on active chips and primary buttons) |
| Motion | CSS keyframes + framer-motion in parallel; staggered list entrances on data lists (Pendle, stablecoins) |
| Charts | No shared theme: hex colours per chart (#0d9488, #8b5cf6, rgba(4,120,87)…), tick font 8–9px, default Chart.js font (not Vazirmatn) |
| States | `FreshnessBar` uses raw `emerald/amber/rose/sky` and an infinite `animate-ping` |

## 5. Current component system

| Primitive | Assessment |
|---|---|
| `Button` | 4 variants (primary/ghost/outline/danger); no secondary, link, inverse, loading, icon-only size; primary has coloured shadow; `active:scale` on every variant |
| `Input` | Single style, `shadow-card`, no label/hint/error composition |
| `SegmentedControl` | Actually an underline **tab bar** (role=tablist) — used for both page sections and in-card period toggles |
| Pill chips | Re-implemented inline at least 6 times (Markets tabs, Markets source filter, Pendle sub-tabs, Pendle analytics tabs, …) with `shadow-glow` |
| `GlassCard` | One component for everything: hero, list container, KPI tile, notice, link row, filter bar |
| `Sheet` | Good a11y basics (ESC, focus trap, restore, drag-to-dismiss). Bottom sheet on desktop too (max-w-lg anchored to bottom of a 1440px screen) |
| `StateViews` | Error uses red icon tile; Empty/Error share no API with inline notices |
| `SourceBadge` / `ProvenanceBadge` / `FreshnessBar` | Three overlapping ways to express data provenance/freshness, different colours |
| Financial values | No component. Formatting is via `fmtUSD/fmtPct` strings; sign/colour logic re-implemented per file (see §11) |
| Tables | `.sim-table` CSS class; 10px uppercase-ish headers; each module builds its own mobile card variant |

## 6. Current interaction model

* Tabs everywhere (DeFi 4 → flow 5, Pendle 3 → markets 5 / analytics 6, Boros 5, Accounting 7 → journal 4). Up to three nested tab levels.
* Whole cards are clickable `div`s (`PendleCard` uses `onClick` on a `motion.div` — not keyboard reachable) with nested buttons.
* Refresh buttons appear in 6 different styles.
* Filters are a mix of chips, `<select>` and free-text inputs with 8–9px labels.

## 7. Current responsive implementation

* Two effective breakpoints: `md` (768) for table→card and `lg` (1024) for sidebar. Content max-width jumps `max-w-lg` (512) → `md:max-w-3xl` (768) → `lg:max-w-5xl` (1024): on a 1440/1728 screen the content is a 1024px column; on 768 tablets it is 768px with a phone bottom bar.
* Mobile tables are hand-built cards per module; Markets card shows 3 tinted boxes per row (24H/7D/30D).
* Regression guards exist (`responsiveGuards.test.ts`) — valuable; kept.

## 8. Current PWA implementation

* `vite-plugin-pwa` generateSW, NetworkFirst runtime caches for providers; update toast on `onNeedRefresh`. Good foundation.
* Manifest `orientation: 'portrait'` locks installed tablets to portrait. `theme_color`/`background_color` are `#0a0f1e` (dark) while the default light theme paints `#f4f6fa` → dark splash then light app.
* `index.html` has no pre-hydration background or splash: blank white (or dark) frame until JS parses a 249 kB gz bundle.
* No global offline indicator; offline is only discovered per module through provider errors.
* No in-app back affordance in standalone mode on detail screens.
* Precache ships woff **and** woff2 for 6 weights × 3 subsets.

## 9. Accessibility assessment (WCAG 2.2 AA)

| Issue | Severity |
|---|---|
| 527 text nodes at 7–10px (below any legible minimum; fails 1.4.4 resize expectations in practice) | High |
| `text-muted/70`, `/60`, `/50` on 8–9px labels — contrast well under 4.5:1 | High |
| Multiple `<h1>` per page; section headings use `<p>` | Medium |
| Clickable `div`s (Pendle cards, several list rows) — not focusable | High |
| Status conveyed by colour dot only in FreshnessBar/KindDot | Medium |
| Command palette lacks listbox semantics; toasts lack `aria-live` region (each toast has `role=status`, acceptable) | Medium |
| Touch targets: several icon buttons are 28–32px (`p-1`, `p-1.5`, `h-8 w-8`) | Medium |
| Focus ring uses teal accent at 2px — OK; many custom inputs set `outline-none` without a replacement ring (`glass-inset` inputs) | High |
| Reduced motion respected globally — good | — |

Contrast of the **supplied** tokens (computed): `ink-muted` #5B6480 on white 5.9:1 ✓, `ink-subtle` #8A92AB 3.1:1 ✗ (large text/non-essential only), `gain` #0F9D6B 3.5:1 ✗ for small text, `gold` #B7861F 3.3:1 ✗ for small text, `brand-500` #2E5BFF 5.2:1 ✓.

## 10. Visual consistency problems

* Accent colour (teal) contradicts the brand reference (blue) and the logo (navy/emerald).
* Card-in-card-in-card: e.g. `EthSummaryCard` → `glass-inset` grid → tiles; Pendle analytics wraps every row of a result list in its own tinted rounded box.
* `font-black` for labels, counters and table cells alike — no weight hierarchy.
* Coloured shadows (`shadow-glow`) on active chips compete with primary actions.
* Gradient accent strips on hero cards; letter avatars with violet/indigo gradients.

## 11. Financial presentation defects (UI-level)

| FILE | LOCATION | PROBLEM | FIX (presentation only) |
|---|---|---|---|
| `defi/presentation/TvlFlowDashboard.tsx` | protocols list | `${up ? '+' : ''}${fmtPct(v)}` — `fmtPct` already signs → "++4.20%" | `PercentValue` component with single sign policy |
| `boros/presentation/UserCapitalCard.tsx`, `OpportunitiesTab.tsx`, `RiskMonitorTab.tsx`, `defi-loop/presentation/LoopExplorer.tsx` | rate edge / spread / change | same double sign | same |
| `shared/utils/formatters.ts` | `fmtUSD(-12.5)` | renders "$-12.50" (sign after currency) | render "−$12.50"; covered by new unit tests |
| `accounting/presentation/PnlPanel.tsx`, `TradePanel.tsx`, `boros/*` | `x >= 0 ? '+' : ''` + `fmtUSD(x)` | negative values render "$-5.00" | `MoneyValue signed` |
| `pendle/presentation/AnalyticsTab.tsx` | `Flow` rows | tone is fixed per row (`'pos'`), so a **negative** net profit renders green | sign-aware tone |
| `pendle/presentation/PendleRealApyCard.tsx` | Real APY | uses a hard-coded PT price `0.948` for **every** market → fabricated "Real APY" | derive PT price from the market's own `ptDiscountPct`; show N/A when unknown |
| `pendle/presentation/PendleRealApyCard.tsx` | badge labels | labels assigned by array index, not by opportunity kind → wrong label when a kind is missing | label from `o.kind` |
| `eth-summary/presentation/NetWorthHero.tsx` | 24h change | ETH's 24h change is shown next to net worth as if it were the portfolio change | label as "ETH ۲۴ساعته" |
| `eth-summary/presentation/NetWorthHero.tsx` | missing price | `ethPrice ?? 0` → value shows $0.00 when price unavailable | show "—" with unavailable state |
| `accounting/presentation/PnlPanel.tsx` | unrealized P/L | holdings without a price are silently skipped → partial total shown as complete | "partial" state with count of unpriced holdings |
| `markets/presentation/MarketsTable.tsx` | `Usd` | `v <= 0` → "—" (a genuine $0 would be hidden) — acceptable for price/mcap; kept but documented |

## 12. UX problems

* Primary action ambiguity: Markets page has "همگام‌سازی" pill, 4 accent-filled tabs and accent source chips — five brand-coloured elements, none of them an action the user came for.
* Dashboard: 120+ rows on first load; the answer to "what changed today" is not visible without scrolling.
* Calculators show results before inputs are meaningful (CAGR with empty final value shows −100%).
* Accounting forms: amount inputs use placeholders as labels ("مبلغ ($)"), no validation messages, submit buttons `size=sm`.
* Pendle markets: 4 APY badges + discount badge + 4 meta badges per card = up to 9 pills per row.

## 13. Information hierarchy problems

* All numbers `font-black`; labels `font-bold`; hero figure only 26px on mobile.
* Section titles 11–13px, same size as body.
* Provenance and freshness banners (rate-limit bars, sync bars, freshness bars) sit **above** content and push data below the fold (Pendle: rate-limit quota bar is the first thing on the page).

## 14. Mobile-specific problems

* 8–9px text is unreadable on phones; multiple rows truncate names to 14 characters (`m.name.slice(0, 14)`).
* Bottom nav labels 10px; active pill background inside a 56px bar.
* Tables → cards with tinted mini-boxes per metric (3 boxes × 50 rows) — heavy scroll.
* Sheets use `max-h-[85dvh]` without sticky header/footer; long forms scroll the close button away.
* Toast offset hard-coded (`6rem`) independent of the actual nav height.

## 15. Desktop-specific problems

* Content capped at 1024px regardless of screen width; sidebar + 1024 column leaves 400+px unused at 1728.
* Bottom sheets anchored to the bottom edge on desktop (asset detail, settings).
* Tables have no sticky first column, no sorting on Markets, hover only.
* Command palette cannot navigate to pages.

## 16. PWA-specific problems

See §8. Additionally: iOS `black-translucent` status bar is used with `pt-safe` only on the top bar; pages with their own sticky elements do not account for it. Standalone mode shows an "install" button until `appinstalled` fires (iOS never fires it) — the install CTA remains visible inside an installed iOS PWA.

## 17. Performance issues affecting UI

* framer-motion (37 kB gz) for opacity fades that CSS already provides (`anim-fade-*` classes exist).
* Staggered entrance animations on long lists (Stablecoins: 30 motion components; Pendle: up to 200).
* Precache 2.4 MB, of which ~1.3 MB is duplicate `.woff` fonts and unused weights (500, 900).
* Main chunk 769 kB — Markets home is eagerly imported (intended), plus constants/catalogs.

## 18. Components requiring consolidation

| Existing | Consolidate into |
|---|---|
| 6+ inline pill-chip implementations | `ChipGroup` (filter chips) |
| `SegmentedControl` used both as page tabs and as period toggle | `Tabs` (page sections, underline) + `SegmentedControl` (compact toggle, pill track) |
| `SourceBadge`, `ProvenanceBadge`, `FreshnessBar` colours | shared `StatusDot`/`Badge` tones + restyled `FreshnessBar` |
| `StatCard` (calculators), `StatChip` (dashboard), `Kpi` (Pendle), inline KPI tiles (Boros, Vehicle, DeFi) | `Metric` / `MetricGrid` |
| `Pct`, `Usd` (Markets), `ChangeBadge` (TVL), sign/colour snippets in 20 files | `MoneyValue`, `PercentValue`, `DeltaValue` |
| Per-file refresh buttons | `Button variant="ghost" size="sm"` + `RefreshButton` |
| Per-file search inputs (7) | `SearchField` |
| Native selects (4 styles) | `Select` |

## 19. Components requiring extraction

`PageHeader` (with eyebrow/back/actions), `Section`/`SectionHeader`, `Surface`, `Field` (label + hint + error), `Notice` (inline calm status), `OfflineBanner`, `ListRow`, `KeyValueList`, `IconButton`, `chartTheme`, route/navigation config (`navigation.ts`).

## 20. Screens requiring full redesign

Shell (sidebar, top bar, bottom nav, tablet rail) · Dashboard · Markets · Pendle list + detail + analytics · Accounting (overview-first) · Calculators (input → result hierarchy) · DeFi (flow/overview) · Design-system page (new).

## 21. Screens requiring refinement

Boros (5 tabs, heavy analytics — keep structure, apply system), Yield Loop, Simulation, Vehicle, Property market, Settings sheet, Install sheet, Command palette.

---

## 22. Prioritised issue register

Format: FILE · LOCATION · PROBLEM · WHY IT MATTERS · PROPOSED SOLUTION · DESKTOP / MOBILE / PWA IMPACT · PRIORITY

1. **`src/styles/index.css`, `tailwind.config.js` · tokens** · Teal accent, no brand scale, alpha-soup borders · Brand identity and hierarchy are not controlled by the system · Replace values with the supplied reference; add brand/gold/subtle/divider; keep variable mechanism so every screen inherits · D: high / M: high / PWA: theme-color · **P0**
2. **All presentation files · typography** · 832 arbitrary sizes, 32% ≤ 9px · Legibility, WCAG, hierarchy · Semantic type scale mapped to the reference; codemod every arbitrary size onto it (minimum 11px micro, 12px caption) · D: medium / M: critical / PWA: critical · **P0**
3. **`TopBar.tsx` · title** · Hash substring matching, wrong titles, duplicate H1 · Orientation and screen-reader structure · Route config as single source; top bar shows context, pages own the single H1 · all · **P0**
4. **`BottomNav.tsx` / `Sidebar.tsx` · breakpoints** · Phone bar on tablets, 3 copies of nav config · Tablet/iPad feel like a stretched phone · `navigation.ts`; tablet rail at md; sidebar at lg; bottom bar < md · **P0**
5. **`DashboardPage.tsx` · composition** · No hierarchy; 120+ rows · First viewport must answer "what do I own / what changed" · Hero → allocation → attention → watchlist → movers (top 5, expandable) → secondary · **P0**
6. **Financial sign/format defects (§11)** · Wrong or fabricated numbers on screen · Trust · `MoneyValue/PercentValue/DeltaValue`, sign-aware tones, remove hard-coded PT price · **P0**
7. **`Button`, `Input`, selects, chips** · Inconsistent controls · Predictability, a11y focus · Complete control system with shared height/radius/focus · **P1**
8. **`GlassCard` overuse** · Card soup · Hierarchy through space, not boxes · `Surface` variants + `Section`; flatten nested tiles to divided lists · **P1**
9. **`Sheet.tsx` · desktop** · Bottom sheet on desktop · Desktop ergonomics · Responsive: bottom sheet < md, centred dialog/side panel ≥ md · **P1**
10. **framer-motion** · 37 kB gz for fades · Startup · Replace with CSS classes; drop dependency · **P1**
11. **`index.html` / manifest** · No splash, dark splash on light app, portrait lock · PWA first impression · Inline themed splash + background, `orientation: any`, light manifest colours · **P1**
12. **Offline** · No global signal · Trust in stale numbers · `useOnlineStatus` + shell banner · **P1**
13. **Charts** · Per-chart colours/fonts · Consistency · `chartTheme.ts` reading CSS variables · **P2**
14. **Precache** · 2.4 MB · Install/update time on mobile · woff2 only; drop unused weights · **P2**
15. **Design-system page** · Missing · No source of truth · `/design-system` route rendering live components · **P1**

## 23. Recommended redesign architecture

```
src/shared/design/          tokens reference (TS mirror for charts), chartTheme
src/shared/components/ui/   Button, IconButton, Field/Input/Select/SearchField, Tabs, SegmentedControl,
                            ChipGroup, Badge, Surface(GlassCard alias), Section, Metric, MetricGrid,
                            KeyValueList, ListRow, MoneyValue, PercentValue, DeltaValue, StatusDot,
                            Notice, EmptyState, ErrorState, OfflineState, Skeleton, Sheet (responsive), Toast
src/shared/components/layout/
                            navigation.ts (single source), AppShell parts: Sidebar (lg), NavRail (md),
                            BottomNav (<md), TopBar (context), PageHeader, OfflineBanner, CommandPalette
features/*/presentation     recomposed on the primitives; domain/data layers untouched
/design-system              live documentation route
```

Breakpoints: `xs` 360 · `sm` 480 · `md` 768 (rail) · `lg` 1024 (sidebar) · `xl` 1280 · `2xl` 1536 (wide content 1280 → 1440 max).

Guiding constraint: **no file under `domain/`, `engine/`, `data/`, `pipeline/`, `collector/`, `service/`, `repositories/` or `api/` changes** unless a confirmed bug requires it.
