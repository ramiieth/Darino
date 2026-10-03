# Boros collateral and portfolio — 2026-10-03

## Delivered

- Corrected Persian quantity labels. Already-translated units no longer go through Latin ticker spelling a second time; `بیت کوین رپ شده` stays intact. Collateral amounts display up to eight fractional digits.
- Explicitly query the cross-margin handle for every supported collateral asset for the selected wallet/root and sub-account. Main-account isolated handles are discovered via `market-acc-infos-by-root`; active-position handles are included. Deposited collateral does not require an open position.
- Require the returned handles to match the requested handles. Missing responses raise an error and preserve saved data, rather than inventing zero. Wallet/sub-account ownership and duplicate checks remain enforced.
- Hide confirmed empty collateral rows. Unknown amounts remain unknown. An unfunded account without positions does not trigger a liquidation alarm.
- Show wallet-level gas/relay credit separately from collateral equity. The provider's `balanceInUSD` is already dollars; it must not be divided by 1e18 or added to token collateral.
- Compact Persian portfolio with seven tabs: collateral, positions, open orders, order history, trade history, settlements, transfers. Desktop positions use a table; mobile/PWA uses cards and horizontally scrollable touch tabs. Cross-margin figures are labelled as account-wide, rather than pretending each position owns the whole margin.
- History is loaded on demand and cached on the server, not fanned out on every background account refresh. Trade events come from actual `position-update-events`; order placement amounts are never relabelled as completed trades. Recent scans are bounded to eight discovered account/market pairs and always labelled incomplete lifetime history. Trade PnL is already net of fees; fees are not subtracted again.
- Existing authentication, server-only API key and read-only preview boundaries retained. No trade, signature, deposit, withdrawal or SDK installation was introduced.

## Official contract checked

- https://api-boros.pendle.finance/apis/docs (embedded OpenAPI schemas)
- https://docs.pendle.finance/boros-dev/Backend/api

The current published contract uses `/apis/v1`, `root` and `accountId`. Querying balances does not infer the wallet from the API key. Balance/position/transfer token quantities are normalized x18, even for USDT; gas credit is a numeric USD balance.

## Validation

- Full suite: 103 files / 1,192 tests passing.
- Production build and PWA service-worker generation passing.
- Browser QA: seven tabs at 320, 390, 768 and 1440px, light/dark, touch, installed-PWA styling flag, no horizontal page overflow, proper Persian units, hidden empty BTC collateral, funded account with no position, quota-error preservation and unchanged read-only official simulation.
- New regressions: deposited cross collateral with an empty position list, selected sub-account, missing balance responses, Persian-unit preservation, authenticated lazy histories, real executed trade quantities/net PnL, foreign-wallet rejection and history-provider failure.

## Limits and verification of the reported account

No live wallet address or signed-in deployed session was supplied; no secret was inspected. The actual user's deposited balance has therefore not been verified. The saved root must be the wallet used in Boros and the sub-account index must match the deposit. The API key alone does not select these.

For nonzero sub-accounts the API cannot enumerate every isolated collateral handle without a position; the existing explicit partial-coverage warning is retained. History is recent/bounded, not an all-time accounting ledger. The position table labels unrealized PnL correctly rather than claiming the API's cumulative trade/settlement fields are PnL since the current position opened. TP/SL trading controls from the Boros reference are deliberately absent from this read-only portfolio.

No production deployment or main-branch merge is part of this implementation.
