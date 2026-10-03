# Dashboard cost basis across wallet, Arcus and Boros — 2026-10-03

## Behavior

- Every live holding has an obvious edit button in the desktop table and mobile/PWA card. The sheet retains one editable total-cost field; balance/current value are provider data and average cost is derived.
- Wallet cost rows now include provider-verified stablecoin holdings without requiring a stablecoin FIFO purchase history. Spam, dust and provider-invisible rows remain filtered.
- Arcus mainnet quote-account credit and Boros actual cash collateral are included. Keys include platform, wallet/root, sub-account and balance handle; a same-symbol wallet holding and collateral balance cannot overwrite one another's costs. Quote credit is explicitly labelled as a USD accounting unit, not an independently fetched USDG spot price.
- Arcus spot-wallet balances on Robinhood are read from the existing Zerion store. If the Arcus wallet is already connected, it is not added again; different Arcus sub-accounts sharing a wallet do not duplicate its physical spot holdings. New spot-wallet reads use the existing cooldown/cache and throttled transaction loaders.
- The previously recorded FIFO lots and reconciliation revisions remain intact. The table only displays actual current holdings, not old purchases as balances.
- Derivatives have their own API-only cards below the holdings table: Arcus perp size/entry/mark/unrealized PnL and Boros funding long/short size/fixed entry APR/mark APR/unrealized PnL. Contract size, borrowed notional, account equity and collateral are never added together as purchased crypto. Boros collateral uses cash, excluding position value already in account equity.
- The editor refuses to save a typed total against a balance that changed while the sheet was open. Stale or incomplete balances cannot be reconciled. A platform quantity change invalidates its current-balance cost reconciliation instead of guessing deposits, withdrawal costs or FIFO.
- The assistant consumes the same all-source cost model as the dashboard, with source labels and the same unknown/stale rules.

## Scope

This panel constructs no new whole-portfolio total. The existing dashboard's global equity aggregation is unchanged; Boros versus Zerion protocol overlap has not been proven. Shares are suppressed when extra platform/spot sources are present rather than displaying percentages against an incompatible total. Testnet balances and closed/zero-size perp positions are excluded.

Real entry prices/APRs of derivatives are provider facts and are not manually overwritten by a purchase-cost field. Only current owned balances/collateral have manually editable cost basis. Platform deposits/withdrawals that change quantity require a new reconciliation; this is not an all-time cross-platform trading ledger.

## Validation

- 104 files / 1,201 tests passed.
- TypeScript client/server and production/PWA build passed.
- Isolated browser QA passed at 320/390/768/1280/1440px in light/dark and touch layouts: visible edit controls, one-field sheet, fractional Persian quantities, automatic average, live save propagation, separate wallet/Arcus/Boros cost keys, preserved old lots, responsive cards/table, and changed-balance save blocking.
- New tests assert collateral cash rather than equity/notional, account isolation, quantity-change and stale PnL gating, stablecoin inclusion, testnet filtering, wallet deduplication and API-only derivative entries/PnL.
- A live public Boros root supplied by the user was read without authentication and normalized through the actual account reader: main account 0 has 0.021 WETH and no open positions. The temporary live test passed and was removed; no user address/credential fixture is committed. An installed device PWA and production deployment were not exercised; no main merge performed.

This branch also includes the preceding unmerged Boros collateral/portfolio fix (`f7b3583`).

## Connection and quota corrections

- Removed the incorrect static Bearer interpretation of `BOROS_API_KEY` from public account, simulation and market reads. Official examples distinguish public balance reads from Ed25519 `x-pendle-auth` signing credentials for protected routes. Darino's account endpoint remains protected by its own session; no wallet signing or trade submission is enabled.
- Direct collateral lookup returned all five supported cross balances for the supplied main account. Its WETH deposit is present before any position is opened. A key alone never selects the root/sub-account: choose the public deposited wallet in account management.
- Zerion now reserves 550ms request slots atomically across serverless instances in the existing `providerCache` table. Deadline-bounded queue and existing request dedup/cache remain; unavailable DB falls back to local serialization, so cross-instance coordination requires the existing database/cache service to be healthy. This reduces bursts; it cannot create additional daily/monthly quota.
- Latest complete wallet snapshots use a user/address-scoped hash independent of the API credential. Credential rotation no longer hides previously stored assets. Legacy snapshots migrate lazily while the previous credential is configured. Raw response cache and cooldown remain key-scoped.
- Client temporary throttling honors provider Retry-After instead of extending every short pause to at least 60 seconds. Exhausted daily/monthly quotas still wait for the reported reset; valid balances stay visible rather than fabricated zero.
- Regression tests cover cold instances, distinct atomic slots, queue deadlines, retained balances after credential rotation, and public Boros reads with and without a configured key.

Sources: [Boros official examples](https://github.com/pendle-finance/boros-api-examples), [Boros OpenAPI](https://api-boros.pendle.finance/apis/docs), [Zerion organization rate limits](https://developers.zerion.io/rate-limits). A second key in the same organization does not independently enlarge its documented organization quota. Consult the dashboard usage/reset and upgrade the plan if measured daily/monthly use exceeds it.
