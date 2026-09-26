# Darino — UI/UX Redesign Report

Date: 2026-09-26 · Companion to [DESIGN-AUDIT.md](DESIGN-AUDIT.md) (the "before" state and issue register).
Live reference: the `/design-system` route (`src/features/design-system/DesignSystemPage.tsx`) renders every token and component described here, in light and dark.

---

## 1. Summary of outcomes

| Measure | Before | After |
|---|---|---|
| Arbitrary `text-[Npx]` font sizes | 832 (sizes down to 7px) | **0** (floor: 11px `text-2xs`, badges/overlines only) |
| Raw palette colours / hex in TSX | 72 palette + 20 hex | **0** (only the brand logo SVG and the design-system reference page contain hex) |
| Main JS chunk | 769 kB / 249 kB gz | 530 kB / **170 kB gz** |
| PWA precache | 97 entries / 2.40 MB | 78 entries / **1.72 MB** |
| framer-motion | 37 kB gz chunk, 12 files | **removed** (CSS motion + `prefers-reduced-motion`) |
| Horizontal overflow at 320 / 768 / 1024 px | several routes | **0 on all 12 routes** |
| Tests | 744 (3 failing, pre-existing) | 750 (**747 pass**, the same 3 pre-existing failures) |
| Typecheck | clean | clean |

---

## 2. Preserved design system

The supplied reference system is implemented verbatim as CSS variables (`src/styles/index.css`) bound to Tailwind (`tailwind.config.js`):

- **Brand** 50 `#EEF3FF` · 100 `#DCE6FF` · 500 `#2E5BFF` · 600 `#1F47E0` · 700 `#1837B0` · 900 `#0B1B5C`
- **Ink** `#0E1530` · muted `#5B6480` · subtle `#8A92AB`
- **Surfaces** white card · canvas `#F6F8FC` · line `#E6E9F2`
- **Semantic** gain `#0F9D6B` · gold `#B7861F`
- **Radii** 8 (`rounded-control`) · 12 (`rounded-field`) · 16 (`rounded-card`) · 24 (`rounded-panel`)
- **Spacing** 4px grid, 20px page gutter (`px-gutter`)
- **Type** Display 48/62 · H2 30/40 · Figure 24/32 · H3 18/28 · Body-lg 18/32 · Body 16/28 · Label 14/20 · Caption 12/20, exposed as Tailwind sizes and semantic `.t-*` classes
- **Font** Vazirmatn; RTL-first with logical properties throughout

## 3. Extensions to the system (and why)

Each extension fills a gap the reference didn't cover. All values meet WCAG 2.2 AA at their intended use.

| Token | Value (light) | Why |
|---|---|---|
| `gain-text` | `#0B7F57` | Reference gain `#0F9D6B` is 3.4:1 on white, which fails AA for small text. Used for text under 18px (5.0:1). The reference gain stays for fills, large figures and charts. |
| `loss` | `#C8293F` | The reference had no loss colour. A financial product needs one, paired with gain (5.5:1). |
| `gold-text` | `#8F6812` | Same reasoning as `gain-text` (5.0:1). |
| `surface-2` | `#EFF2F8` | Inset fields and neutral tints, one step below canvas. |
| `divider-strong` | `#D5DAE7` | Control borders need more contrast than hairline dividers (non-text contrast). |
| `on-accent` | white / dark `#090D1B` | Text on the primary button. In dark mode brand-500 is lightened, so white text on it fails. |
| `warn` `#B45309`, `info` = brand-600 | — | System states (stale data, caution) that aren't gain or loss. |
| `chart-1…6`, `chart-grid`, `chart-axis` | brand-derived | A categorical palette built from brand and neutrals, so charts no longer use rainbow hex. |
| `2xs` 11/16, `xl` 20/30, `4xl` 36/46 | — | Badge/overline floor, mobile page title, and hero figure. These are the gaps between reference steps. |
| Shadows `card` / `card-hover` / `pop` | ink-tinted | Only three elevation levels. `accent` and `glow` were removed. |
| Screens `coarse`, `standalone`, `3xl` | — | 44px touch targets, installed-PWA tweaks, and 1728px desktops. |
| z-index `nav/overlay/sheet/palette/toast` | 40–90 | Named layering in place of ad-hoc values. |
| Durations `fast/base/slow` | 120/200/280 ms, `ease-standard` | Motion tokens. |

**Dark theme** (extension, derived from the reference): canvas `#090D1B`, surface-2 `#181F36`, brand-500 lightened to `#6E8BFF` (5.6:1 on dark cards), with brand-50/100 remapped to tinted selection surfaces.

### Token changes (old → new)

| Token | Old | New | Why |
|---|---|---|---|
| `--c-accent` | teal `13 110 101` | brand-500 `46 91 255` (`accent` now aliases `brand-500`) | Align to the reference brand |
| `--c-accent-soft` | `214 245 238` | brand-50 | Same |
| `--c-surface` | `246 247 250` | `--c-canvas` `246 248 252` (`surface` kept as an alias) | Reference canvas |
| `--c-ink` | `17 24 39` | `14 21 48` | Reference ink |
| `--c-muted` | `100 116 139` | `--c-ink-muted` `91 100 128` (Tailwind `muted` unchanged) | Reference ink-muted |
| `--c-positive` | `4 120 87` | `--c-gain-text` `11 127 87` (Tailwind `positive` unchanged) | Reference-derived gain for text |
| `--c-negative` | `190 18 60` | `--c-loss` `200 41 63` (`negative` unchanged) | Tuned to sit next to the brand blue |
| `--c-info` | `29 78 216` | brand-600 | Fewer blues |
| `--c-line` | slate `15 23 42` | ink `14 21 48` | Translucent base matches ink |
| fontSize `2xs` | 10/16 | 11/16 | 10px Persian text is illegible |
| fontSize `xs` / `sm` / `base` / `lg` | 11 / 13 / 15 / 17 | 12/20 · 14/22 · 16/28 · 18/28 | Reference scale |
| `rounded-4xl` 28px | — | removed → `rounded-panel` 24 | Reference radii |
| `shadow-accent`, `shadow-glow` | — | removed | Coloured glow shadows conflict with a calm fintech tone |

Legacy class names (`text-positive`, `text-muted`, `bg-surface`, `.glass*`, `GlassCard`) were kept as aliases, so no call site broke silently.

---

## 4. Visual changes

- One card system (`Surface`: raised / focal / subtle / flat) replaces 150+ `GlassCard` variants. Blur, glow and gradient cards were removed. `.glass*` classes now map to the Surface styles.
- Hierarchy comes from type and spacing rather than boxes. `MetricGrid` separates metrics with hairlines, and heavy weights are reserved for figures.
- Numbers go through `MoneyValue` / `PercentValue` / `DeltaValue` / `QuantityValue`. These components give LTR isolation, tabular numerals, one sign policy (`-$12.50`, `+$3.10`), a "—" for unavailable values (never a fake `$0.00`), and explicit loading and stale states. Gain/loss colour always comes with a sign or an arrow.
- Charts share `src/shared/design/chartTheme.ts`: token colours, one tooltip, USD axes, thinned ticks, and dark-mode awareness.
- Tables share one `.data-table` system: sticky header, right-aligned numeric columns, compact variant, row headers.
- Asset logos fall back to neutral monograms instead of random colours.

## 5. UX changes

- **Presentation bugs fixed.** Double `+` signs; `$-x`; negatives rendered green (operator-precedence bug `?? 0 >= 0`); a fabricated Pendle PT price (hard-coded 0.948) and index-based labels; the "TVL" panel that actually showed total crypto market cap (relabelled); signed amounts shown with 6 decimals; a CAGR of −100% on empty input; the Compare calculator's name sort, which did nothing; DCA unit formatting; a blank page when printing; settings API keys that were never saved; Pendle min-TVL unit mismatch (M$); a vehicle price-kind toggle that did nothing (removed); allocation/legend colour mismatches; gain/loss colours misused for "vs median".
- **React correctness.** Removed `setState` / side effects inside `useMemo` (XIRR, Loop explorer/calculator, snapshot sheet). Boros risk analysis no longer re-runs on every render.
- **Accounting.** Multiple `useAccounting` instances went stale against each other. A single `AccountingContext` fixes that. Tabs can be deep-linked (`?tab=`), and journal reversal now asks for confirmation in a `Dialog` and uses the `destructive` button.
- **Forms.** `Field` (label, hint, error, wired through ARIA) and `Input` (suffix, LTR numeric alignment). Numeric inputs no longer let the suffix collide with the placeholder. `Select` replaces 29 ad-hoc selects.
- **One Button system.** One primary action per view, and `loading` keeps the button's width.
- **State views.** `ErrorState` (with retry), `EmptyState`, `OfflineState`, `Notice` and skeletons replace ad-hoc messages.
- **Calculators.** Shared `CalcShell` / `ResultHero` / `ResultPlaceholder`, so every calculator reads input → result → chart the same way.

## 6. Navigation changes

- IA is grouped into **Markets / My assets / Yield / Tools** (`src/shared/components/layout/navigation.ts`, the single source for every nav surface).
- **Desktop (≥1024):** collapsible `Sidebar` with search, theme, settings and install in the footer.
- **Tablet (768–1023):** `NavRail`.
- **Mobile (<768):** `BottomNav` with 4 primary destinations (Market, Dashboard, DeFi, Accounting) plus a "More" sheet for the rest.
- **Command palette** (⌘K / Ctrl-K): pages and assets, with proper combobox/listbox ARIA. Asset search is passed into the Markets page, which previously ignored it.
- `PageHeader` provides eyebrow, title, meta and a back button for drill-ins (Pendle market detail, Loop analysis). On route change the page scrolls to top and focus moves to the main heading.
- Section tabs are underline `Tabs` with roving tabindex.

## 7. Responsive changes

- Adaptive shell: bottom nav → rail → sidebar. Content width is capped at `max-w-content` (1280), or `content-wide` (1440) on data-dense screens.
- Tables collapse to card lists on phones (e.g. `MarketsTable` → `MarketCard`). On wider screens they scroll horizontally inside their card.
- `.grid > * { min-width: 0 }`, chip bleed made opt-in, and wrapping in `KeyValueList` fixed every overflow found at 320px.
- Verified by a Playwright sweep of all 12 routes at 320, 390, 768, 1024 and 1440 widths, with 0 horizontal overflow.

## 8. Mobile changes

- Touch targets are at least 44px on `coarse` pointers (buttons, inputs, nav).
- A compact sticky `TopBar` with the page title. `OfflineBanner` shows when the network drops.
- A `Sheet` with a drag handle, focus trap, scroll lock and safe-area padding. The `auto` variant is a bottom sheet on phones and a side panel or dialog on larger screens.
- Body text is 16px (it was 15), which also prevents iOS zooming into inputs.

## 9. PWA changes

- Theme-color metas for light and dark (`#F6F8FC` / `#090D1B`), updated live by `themeStore.applyTheme`.
- A themed splash is rendered before hydration, and the theme script runs in `<head>`, so there is no white flash in dark mode.
- Manifest: `orientation: 'any'` (was portrait-locked, which broke tablets), matching background/theme colours.
- Precache now includes only woff2 fonts, and the unused 500 and 900 Vazirmatn weights were dropped (−0.57 MB).
- `InstallPrompt` restyled. Install is also available from the sidebar or More sheet.
- Safe-area insets are respected by the bottom nav, sheets and toasts. `standalone:` variants are available.
- Production preview check: the service worker registers and the manifest is served correctly.

## 9a. Brand mark (logo redesign)

The old mark was a navy→emerald hexagon with a stepped arrow. Its palette didn't match the product's brand blue, and the thin hexagon outline blurred at favicon sizes.

- **New mark, "Growth D":** two ascending bars plus a half-circle bowl on a rounded brand tile (brand-500 → brand-700). Together they read as the letter D (Darino) and as a growth chart. It uses only three solid shapes, so it stays legible at 16px.
- **Variants:** full colour (tile), monochrome (`mono`: glyph in `currentColor`, no tile), and a wordmark lockup with the Persian or Latin name.
- **Single source of geometry:** `src/shared/components/brand/DarinoLogo.tsx`. The same geometry is used by `scripts/generate-brand-icons.mjs` and the pre-hydration splash in `index.html`.
- **Icons regenerated at their true pixel sizes.** The old files were double the size the manifest declared (for example, `icon-192.png` was 384px):
  - `favicon.svg` (new, vector) and `favicon.png` 64px
  - `icon-192`, `icon-512` and `icon-master` 1024px: rounded tile with transparent corners (manifest "any" purpose)
  - `icon-maskable-512`: full bleed, with the glyph scaled into the 80% safe zone (Android adaptive icons)
  - `apple-touch-icon` 180px: full bleed, because iOS applies its own mask
- **`public/brand-sheet.html`** has been rewritten for the new identity: light, dark, on-brand and monochrome versions, size ladder, colours and usage rules.

## 10. Accessibility changes

- Contrast: every text token passes AA (see §3). `gain-text` and `gold-text` exist specifically for this.
- A visible focus ring (brand) on every interactive element, and a skip link to main content.
- Tabs, segmented controls and radio groups use roving tabindex and correct roles. Sheets and dialogs trap focus and restore it on close.
- Icon-only buttons require an `aria-label` (enforced by the `IconButton` type).
- Unavailable values have an accessible name ("نامشخص"). Loading values announce "در حال بارگذاری".
- Gain/loss is never communicated by colour alone.
- `prefers-reduced-motion` disables animations.

## 11. Performance changes

- framer-motion was removed (−37 kB gz). Motion is now CSS keyframes.
- The settings sheet and command palette are lazy-loaded and mount only when open.
- Main chunk: −79 kB gz. Precache: −0.68 MB.
- Removed dead code: `CryptoMarketExplorer.tsx`.
- No new dependencies were added.

---

## 12. Component architecture

```
src/shared/
  design/chartTheme.ts            chart tokens + baseChartOptions
  components/ui/
    Button.tsx                    Button, IconButton, buttonClass
    Input.tsx                     Field, Input, Select, SearchField
    SegmentedControl.tsx          Tabs, SegmentedControl, ChipGroup
    Badge.tsx                     Badge, StatusDot
    GlassCard.tsx                 Surface, Section, SectionHeader (+ GlassCard alias)
    FinancialValue.tsx            MoneyValue, PercentValue, DeltaValue, QuantityValue,
                                  Metric, MetricGrid, KeyValueList
    StateViews.tsx                Notice, ErrorState, EmptyState, OfflineState, ListSkeleton
    Sheet.tsx                     Sheet (auto/panel/dialog), Dialog
    Skeleton.tsx                  Skeleton, PageSkeleton
    ListRow.tsx, Disclosure.tsx
  components/layout/
    navigation.ts                 IA + active-route logic
    Sidebar.tsx, BottomNav.tsx (BottomNav, NavRail, MoreSheet), TopBar.tsx,
    Page.tsx (Page, PageHeader, BackButton), CommandPalette.tsx, InstallPrompt.tsx
  store/shellStore.ts             sidebar collapse, palette/more-sheet state
  hooks/useOnlineStatus.ts
```

Feature screens compose these primitives and keep view-model logic in hooks (for example `usePortfolioOverview`). Components format values and never compute business values.

## 13. Files

**Created (14):** `DESIGN-AUDIT.md`, `DESIGN-REDESIGN-REPORT.md`, `src/features/design-system/DesignSystemPage.tsx`, `src/features/accounting/presentation/AccountingContext.tsx`, `src/features/eth-summary/presentation/{DashboardAside,PositionsSection}.tsx`, `src/features/eth-summary/presentation/usePortfolioOverview.ts`, `src/shared/design/chartTheme.ts`, `src/shared/components/layout/navigation.ts`, `src/shared/components/ui/{Badge,Disclosure,FinancialValue,ListRow}.tsx`, `src/shared/hooks/useOnlineStatus.ts`, `src/shared/store/shellStore.ts`.

**Brand (logo redesign, §9a):** `src/shared/components/brand/DarinoLogo.tsx`, `scripts/generate-brand-icons.mjs`, `public/brand-sheet.html`, `public/icons/*` (regenerated) and new `public/icons/favicon.svg`.

**Deleted (1):** `src/features/cryptomarkets/presentation/CryptoMarketExplorer.tsx` (not referenced anywhere).

**Modified (105):**
- Config / shell: `index.html`, `package.json`, `package-lock.json` (framer-motion removed), `tailwind.config.js`, `vite.config.ts`, `src/styles/index.css`, `src/app/{App,main}.tsx`, `src/app/providers/AppProviders.tsx`, `src/shared/store/themeStore.ts`.
- Shared UI and layout: every file in `src/shared/components/ui` and `src/shared/components/layout` listed in `git status`, plus `brand/DarinoLogo.tsx`.
- Presentation for every feature: accounting, boros, calculators, cryptomarkets, defi, defi-loop, eth-summary, market, markets, pendle, propertyMarket, simulation, vehicle.
- Formatting: `src/shared/utils/formatters.ts` (+ tests). `fmtUSD` puts the sign before the currency; new `fmtUsdSigned`.
- Tests updated for the new markup only: `AssetName.test.tsx` (token classes), `Sheet.test.tsx` (`[data-sheet-overlay]` selector). No assertions were removed.

## 14. Domain files

**One intentional change, a confirmed bug.** In `src/features/accounting/domain/engine.ts`, selling part of a FIFO lot marked the whole lot as closed, so the remaining quantity disappeared from holdings and cost basis.
- Added `applyFifoConsumption(lots, consumed, now)`, which closes a lot only when it is fully consumed.
- Added `repairPartiallyClosedLots(lots)`, which reopens lots that previous sessions closed wrongly.
- Wired both into `useAccounting.ts` (`sellCrypto` and `reload`).
- 4 new tests in `engine.test.ts`.
- No formula, journal-entry shape or persistence schema changed.

**Intentionally untouched:** every other `domain/`, `data/` and `api/` module. That includes all Boros, Pendle, simulation, calculator, loop, vehicle and property-market math, the accounting journal and P&L, Dexie schemas, and query hooks. The 3 failing Boros tests are left as they were (see §16).

## 15. Tests executed

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `vitest run` | 46 files, 750 tests: **747 pass, 3 fail** (pre-existing, see §16) |
| `vite build` | succeeds. CSS 57 kB (11 kB gz), JS 530 kB (170 kB gz), precache 78 entries / 1.72 MB |
| `vite preview` smoke (Chrome via Playwright) | `/`, `/dashboard`, `/accounting`, `/pendle` render with 0 overflow. The service worker registers and the manifest is valid. |
| Visual QA (dev server, Playwright + Chrome) | 12 routes × 320/390/768/1024/1440, light and dark, tablet rail. 0 horizontal overflow. |

## 16. Remaining limitations and recommendations

1. **3 failing tests (pre-existing).** They are in `boros/domain/calc.test.ts` and `boros/domain/engine/audit.test.ts`. The fixtures use maturity dates that are now in the past, so the tests depend on the current date. Fix by injecting `now` into the fixtures; this is domain code, so it was left out of scope.
2. **Repo Playwright scripts** (`scripts/smoke.mjs`, `scripts/responsive-audit.mjs`) expect Playwright's bundled Chromium, which isn't installed. QA used installed Chrome (`channel: 'chrome'`) instead. Run `npx playwright install chromium`, or add the channel option.
3. **404s in preview** on `/dashboard` and `/accounting`. These are external asset-logo/API requests that fall back correctly. They are not app assets.
4. **The main chunk is still over 500 kB raw.** The next step is to lazy-load Chart.js per route, and split the Boros and Pendle analytics.
5. **The landing route stays on Markets**, as the owner decided. For returning users with holdings, `/dashboard` is recommended as the landing page.
6. **Remaining heavy weights:** `font-extrabold` is still used for hero figures, on purpose. `font-black` was removed.
7. **iOS standalone** was checked through emulated safe-area and media queries, not on a physical device.
