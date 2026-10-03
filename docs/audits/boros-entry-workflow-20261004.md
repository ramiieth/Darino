# Boros real-account entry workflow — 2026-10-04

## Result
The first Boros tab is now “پیشنهاد ورود”. It reads available cross-margin for the selected collateral zone, offers maturity limits of 7/30/60/90 days (default 30), margin allocation, scenario-loss filter, explicit gas and extra market-entrance cost assumptions. It does not substitute hypothetical capital for missing account data. Existing account view, market list, hypothetical comparison, manual simulator, glossary and risk monitor remain available. Market list links back to the account-budget recommendations; comparison clearly says hypothetical and displays maturity per market.

## Calculation and ranking
Candidate construction accepts active, whitelisted, unexpired, fresh markets in the same collateral zone and within the selected horizon. It sizes each contract using that market’s margin and per-YU fee coefficients, reserving its own projected opening/settlement fees before margin allocation. Fees are projected for holding to maturity; extra entrance cost and gas are explicit shared user assumptions, not API-confirmed actual costs. Unknown inputs block scanning. Mark-based filtering is preliminary liquidity screening, not an execution guarantee.

An explicit button starts at most eight sequential read-only official previews. Rejected candidates do not stop the batch; later candidates are considered. A 429 stops further calls. No calls are triggered merely by editing form inputs. Changed scope/inputs cancel result publication and stop additional calls. A successful candidate must match the requested account handle, market and direction and have matched size/rate, margin and official liquidation APR. Missing liquidation data does not qualify as a verified recommendation.

The official matched APR replaces the reference rate, so its execution impact is not separately subtracted again as USD slippage. Costs are recalculated for matched size; any immediate mark-to-entry loss is reserved in remaining budget, while hypothetical MTM gains are never treated as spendable cash. API incremental margin is checked against the original free budget. Positive projected net settlement, scenario-loss tolerance and affordable API margin/costs are required. Returned candidates are sorted by projected net USD, then sooner maturity for ties, and deduplicated to at most three distinct markets. These are alternatives using the same budget, not three simultaneous allocations. Coverage counts are shown; this is not an exhaustive/global optimum.

## Transfer and assistant
Selecting a recommendation transfers its market, direction, matched size/rate, scoped quote, margin mode and cost assumptions into the preview. Changes in account balances/positions/orders invalidate inherited quotes; quotes also expire after 60 seconds. The summary separates API additional margin from modeled margin and uses conservative estimated remaining budget. Hypothetical inputs remain separate.

All three financial summaries are published with ranks, costs, horizon, adverse outcome and preview observation time. They are prioritized ahead of generic market rows in assistant context truncation. Navigation into a fresh detail panel does not erase the originating recommendations. Account-scope mismatch removes them from context; expiry marks them stale. No wallet address, handle or credentials enter the assistant’s financial summaries. “توضیح دستیار” opens the existing assistant with a prepared market-specific question; it does not automatically submit to Gemini. The user sends it explicitly. Assistant rules identify shared-budget alternatives, bounded coverage and estimated profits.

## Validation and limits
- 113 test files / 1265 tests passed, including maturity/collateral/freshness filtering, per-market fees and sizing, distinct net-profit ranking, immediate-loss budget reservation, three-candidate context retention/truncation/expiry and withdrawal invalidation.
- Client/server TypeScript and production/PWA build passed.
- New browser workflow passed 320/390/768/1440 light/dark/touch: explicit bounded scan, failed and incomplete-liquidation fallback, three distinct candidates, all-three publication, quote/size/cost transfer and withdrawal invalidation.
- Existing guide and Boros calculation browser smoke tests passed.
- Screenshots inspected using synthetic balances; all external network traffic blocked. Installed-device PWA, live quotes/account availability and Gemini output were not tested.

Profit remains a forecast of settlement at assumed floating APR and current collateral USD price, net of projected/entered costs. Market behavior, future collateral price, gas, actual fees and early closure can change it. Scenario downside is not a guaranteed loss cap or statistical confidence interval. No trade, signature, transfer, SDK installation, credential change or deployment was performed. Same pending branch also includes prior dashboard precision, quota telemetry and cost-PnL changes.
