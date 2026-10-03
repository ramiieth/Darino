# Boros native planner — 2026-10-03

## Delivered

- Compact shared Boros surfaces/tabs for desktop and narrow/touch PWA layouts. Blue/green focal capital result, neutral market cards, Persian identities and actual token/Arbitrum logos.
- Capital planning across all priced active supported markets, both long/short directions. Ranks net USD forecasts; independently assumes the entire supplied capital is allocated to each alternative, not simultaneous positions.
- Explicit user inputs: capital USD, allocation percentage, total lifecycle gas, market-entrance fee assumption, adverse execution APR impact in **percentage points**. Missing costs never default to zero. Protocol opening/settlement fees use each market's own parameters and collateral price.
- Size reserves costs and initial mark-to-entry loss, not only margin. Holding is **until each market's own maturity**; these are different horizons. Floating APR is assumed constant. No incentive rewards or future collateral-price changes are invented.
- Execution APR is assumed mark plus adverse impact for long, minus impact for short. Impact enters the APR once, not again as a dollar fee. Example screenshot mark 8.40%, manual impact 0.22 points => assumed long execution 8.62%, not 8.40%.
- Best card requires positive base net, current active priced market data, estimated isolated threshold, and preliminary liquidity screening. It still shows adverse scenario loss and explicitly does not confirm order-book depth/full execution or guarantee profit. Candidates with missing/insufficient liquidity cannot become the recommendation.
- Scenario action seeds native YU size, USD capital, protocol+entrance fees, gas, and zero additional slippage (already in assumed APR) in the entry analysis. Official read-only preview remains available and can replace assumed rate with its matched APR.
- Simulator unifies the native-YU entry flow and keeps public traded-implied and funding-rate history separate. No fabricated historical position PnL or 1/7/30-day Boros performance ranking.
- Comparison uses common **USD notional**, explicitly different from user capital/margin, and labels gross forecasts; missing execution/gas/entrance costs are disclosed. Cards replace wide mobile tables.
- Risk tab no longer falsely hardcodes "no position"; checks the connected account, distinguishes stale/partial data, and routes users to account details for official thresholds.
- Audit details progressively disclosed. Existing accounting/engine audit still available. Account/previews remain read-only.
- Assistant receives the selected highest-net capital-plan scenario as simulation, with assumed execution APR and estimated (not official) isolated threshold. Context expires old plans; assistant rules distinguish forecasts, official previews and executed positions.

## Sources and interpretation

https://docs.pendle.finance/boros-dev/Mechanics/Margin
https://docs.pendle.finance/boros-dev/Mechanics/Fees
https://docs.pendle.finance/boros-dev/Backend/api

Liquidation is account-state dependent (cash, collateral zone, other positions/orders, effective personal factors and current mark). Historical funding averages alone cannot determine an individual's official liquidation APR. A hypothetical isolated single-position threshold can be calculated before deposit/trade; it must be labelled estimated. The official simulator does not submit a trade; an unfunded account may reject its request or return no threshold. Cross-account exposure is not substituted into the isolated analytical model.

## Verification

- Production build: frontend/server TypeScript, Vite and generated PWA service worker pass.
- Full suite: 100 files / 1,173 tests pass. Added planner tests cover native collateral USD conversion, both directions, execution impact charged once, budget conservation, missing costs, stale/paused/expired/unpriced/invalid-fee markets, net-dollar sorting and liquidity screening; added assistant simulation/staleness test.
- Mocked browser: five analysis tabs at 320/390/1440px, light/dark; Persian fractions, complete-cost gating, allocated size, scenario handoff. Separate account smoke exercises read-only connection/official preview with synthetic responses. Touch layout tested separately.
- Visual inspection: desktop/mobile screenshots of capital planner. No real wallet/API keys, live official quote, trade/signing, deployment or installed-device PWA test performed.
- No new dependency, SDK installation, credential access, schema or database changes.

Screenshots in /tmp/darino-boros-planner-{desktop,mobile}.png are synthetic QA, not actual market or user values.
