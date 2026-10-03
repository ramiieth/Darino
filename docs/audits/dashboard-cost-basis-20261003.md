# Dashboard cost-basis integration — 2026-10-03

Delivered a per-cryptocurrency dashboard section using API balances and the saved remaining FIFO cost book. Desktop columns: Persian asset/logo, balance, current price, weighted average remaining purchase cost, remaining cost basis, current USD value with current USDT/Toman equivalent, open PnL USD/percentage, portfolio share. Below 1280px, compact cards with native expandable cost details replace the table.

A shared pure valuation model now drives the dashboard, purchase page and assistant. Purchase cost remains visible even if history is not covered; PnL stays unknown for incomplete history, stale/incomplete related snapshots, mismatched lot quantities or calculation issues. Partial coverage displays only the known-quantity PnL and explicitly labels it. Average cost is weighted by covered remaining quantity. Share is withheld if the whole portfolio is incomplete/stale.

Related sources are identified by current asset holdings and loaded asset transfer history, rather than blanket dependency on every EVM wallet. Missing unrelated history no longer blocks other assets. This does not prove undiscovered transfers in unloaded unrelated wallets; unknown acquisition/disposal still requires reconciliation and is not invented.

Dashboard reuses the existing activity links and stores; no extra activity polling/provider requests were introduced by the new component. API balances are never modified by purchase records. Verified cash, spam/dust filtering and separate Arcus/Boros PnL stay intact. Realized-sale totals remain separate from open PnL and require their existing full coverage checks. Existing transfer/bridge FIFO semantics are unchanged.

Purchase page announces a successfully saved purchase/migration, displays per-asset shared status and the first calculation issue, retains purchase editing and Persian fractional input. A successful save alone does not certify every transaction or historical fee.

Validation:
- 101 test files / 1,180 tests passed, including seven shared valuation tests: exact fractional example, saved cost vs history gating, unrelated-wallet scope, stale/mismatch/partial states, cross-network aggregation and spam/cash exclusion.
- Production frontend/server TypeScript + Vite + generated PWA service worker passed.
- Isolated browser with synthetic data: 320/390/768/1280/1440px, light/dark and touch, expand/collapse, save-to-dashboard reactivity and incomplete-history PnL gating passed. Desktop/mobile screenshots inspected.
- No live wallet/API verification, deployment, installed-device PWA test, schema/DB migration or new dependency.

QA artifacts: /tmp/darino-cost-{desktop,mobile}.png. Values are synthetic.
