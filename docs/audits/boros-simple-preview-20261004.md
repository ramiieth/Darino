# Boros entry preview: simpler workflow

Implemented on `fix/dashboard-cost-table-format-20261004`, following the user's request to make Darino understandable like Boros while allowing later deposits, withdrawals and changing maturities.

## Behavior

- Preview is the initial Boros tab. Desktop puts market selection/rate history beside the entry panel; mobile/PWA stacks responsive surfaces. Historical charts, extra costs, assumptions and other-market scans are disclosures.
- Prefer an active market using the account's funded collateral. Expired/non-GOOD markets are excluded; expiration is checked every second without recreating unchanged candidate sets or interrupting a scan. Removing the selected market clears its quote and displays a changed-market notice.
- Show free collateral in its own unit and USD; real/hypothetical capital remain separate. Existing account refresh runs every 30 seconds while visible; market refresh remains every two minutes/on focus.
- A bilingual panel shows Pay/Receive, Fixed/Floating, Rate Sensitivity, Margin Required (API post-order margin), liquidation APR, estimated opening fee, execution price impact and matched YU size.
- Successful matching official previews apply automatically. A 60-second countdown exposes quote freshness. Expired quotes remain visibly stale for reference, but cannot supply official entry/liquidation values to the calculation or assistant. Account/balance/order, market, side and size changes invalidate authority. Asynchronous responses are bound to the originating scope.
- Forecast labels distinguish estimated profit/loss to maturity from current account PnL. Without completed cost assumptions, display gross projected settlement with an explicit incomplete-cost note; no fake net zero.
- Entry and settlement fees are calculated from market parameters; the user enters only additional market entrance cost, gas and any genuinely separate extra cost. Recommendation handoff explicitly preserves additional entrance cost separately from modeled protocol fees, avoiding double-counting. Auto-sizing reserves variable fees for the new size.
- Assistant receives quoteVerified/payApr/receiveApr/liquidationApr and is instructed to distinguish assumed rates, account-funded simulations and actual positions.

## Sources

- https://docs.pendle.finance/boros-docs/boros-systems/margin-and-liquidations
- https://docs.pendle.finance/boros-docs/boros-systems/fees

## Validation

- 114 test files, 1269 tests passed, including quote expiry, changed scope/order, future timestamps and expired-market rejection.
- Client/server TypeScript and production/PWA build passed (192 precached entries).
- Browser QA with external requests blocked and synthetic accounts: official preview auto-application, expired quote retained but not authoritative, deposit/withdrawal changes, independent hypothetical funds, expired selected-market replacement; 320/390/768/1440px light/dark and touch layouts without horizontal overflow.
- Existing recommendation, guide/navigation and manual-scenario browser regressions passed. Screenshots visually reviewed.

No real account quote, installed PWA, Gemini response, trade/signature, private key, API permission or deployment was tested/changed. Fees shown in the main quote panel are calculated estimates, not a new API fee field. Slippage shows API priceImpact and the user-selected maximum; no extra slippage is silently double deducted.
