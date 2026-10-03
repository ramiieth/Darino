# Zerion quota and dashboard PnL — 2026-10-04

## Problem and result
The user reports 256 spent / 44 left, while Darino reports throttling. These numbers do not identify the exact production 429 subtype. This audit did not access the deployed API key, headers or Vercel logs.

Fixed a code defect: empty/whitespace quota headers were interpreted as zero. Counts now require valid nonnegative numeric headers. A response without daily/monthly counts preserves the last observed budget and its original timestamp. Per-second, daily and monthly cooldowns remain distinct; real exhaustion still stops requests. Existing free-plan cache, pacing and retained wallet snapshots remain in place. No paid subscription, key rotation, account multiplication, new provider calls or webhook registration is required.

Opening dashboard synchronization details reads the existing authenticated Darino status endpoint (cached provider headers, no upstream Zerion request). Shows separately observed day/month remaining counts and limits, reset times and observation time. Positive 44/300 is approaching the cap, not exhausted. Past reset displays awaiting new statistics rather than yesterday’s exhausted status. Missing telemetry is not presented as a known zero. This does not increase the provider quota or confirm the actual cause of the user’s production 429.

## Profit/loss presentation
Dashboard cost-basis rows retain transaction-reconciled PnL unchanged. Separate estimatedPnl may display a number for a stale, complete, covered snapshot, or for a complete current snapshot with a previously confirmed total cost and exactly matching quantity, when history cannot establish live reconciled PnL. Estimates are explicitly labeled saved/current-snapshot estimates, not realized/trading profits. Prices update reactively. Wallet estimates show the underlying snapshot date in the tooltip; stale numbers retain the clock. Arcus/Boros collateral estimates remain scoped to their account; collateral is not derivative equity/notional.

Pending cost confirmations, quantity mismatch, unknown cost coverage or accounting issues do not generate estimates. Instead of generic unknown PnL, the cell opens the cost editor with the relevant action: enter cost, confirm cost or reconcile quantity. Pending basis still requires explicit confirmation after receiving fresh data, since equal quantity cannot prove that no intervening buys/sells occurred. No stored quantities, FIFO inputs or accounting formulas are rounded. Unresolved portfolio shares remain a dash with an explanation rather than an invented percentage.

## Scope and validation
Same pending branch as prior dashboard two-decimal layout: fix/dashboard-cost-table-format-20261004. Applies to the responsive dashboard cost table/cards and wallet synchronization details, on web and PWA layout. Does not redesign Boros simulator or other app modules.

- 111 suites / 1258 tests passed; two new quota UI tests passed after setting their jsdom environment (112 suites / 1260 tests in total).
- Client/server TypeScript and production/PWA build passed.
- Browser smoke passed at 320, 390, 768, 1280 and 1440, light/dark/touch, including estimated cached PnL, pending confirmation, reactive cost update, quantity-change guard, unit alignment and no page overflow. All provider requests blocked, synthetic accounts only.
- Installed-device PWA and live production quota were not tested.
