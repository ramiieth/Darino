# Boros preview, navigation and cached purchase-cost confirmation

## Diagnosis

- The dashboard message meant a cost was entered against a cached quantity. It was not a provider error or lost purchase record. Keep the pending flag and live-PnL guard, replace the unexplained warning with “بهای ذخیره‌شده”, and expose a direct “تأیید همین هزینه” action once fresh holdings are available. The editor preserves the entered total and explains the next action. Historical-only wallets cannot block freshly reconciled current-holding valuation; FIFO still requires history after reconciliation.
- The user's exact “دریافت داده بوروس انجام نشد” error was not reproduced with the current public endpoint. Authorized readonly live simulation succeeded for the supplied root in market 209 with 1 YU and with the app-default 2 YU. Different volumes produced different liquidation APRs. No signing, order submission or API credential was involved.
- The server previously collapsed upstream validation, timeout and transient failure into a generic data error. Simulation now retries a transient 5xx or network timeout once, never 429 or validation errors. Client timeout allows the bounded retry. Provider 4xx failures are mapped to safe, actionable margin / minimum-size / slippage / full-fill guidance without exposing provider internals. Final success remains contingent on a fully matched FOK response.

## Interface changes

- Markets/opportunities start with actual market cards and an action to inspect the chosen market. Independent manual-capital planning is disclosed as hypothetical.
- Comparison exposes one direction and the same USD contract notional across markets. Separate reference/base APR, estimated margin, protocol fees, modeled settlement and settlement after protocol fees. The displayed latter value is not labeled final net profit: gas, entrance and execution costs are excluded. Each card opens the corresponding market and side in preview.
- Real-account and hypothetical-capital modes remain separate. No trade is sent by Darino.
- Searchable Persian/English guide: five-step workflow plus 40 terms covering rates, collateral, margin, liquidation, orders, fees, funding settlement, PnL and the screenshot's ancillary metrics. RTL Persian, isolated LTR English; grouped disclosures and colored direction cards.

## Validation

110 test files / 1,249 tests passed; client/server type checks and production PWA build passed.
Browser checks passed: guide search, RTL/LTR, market/side navigation, recoverable preview errors, cached-cost save/reconfirmation, capital scenario math/transfer; 320/390/768/1280/1440 layouts, light/dark and touch as applicable. Screenshots visually inspected.
Public live API verification exercises only readonly upstream simulation. Production Vercel deployment, exact original transient failure, installed-device PWA and live Gemini quality were not verified. This change does not require paid Zerion or a Boros API key.

## Official references

- https://docs.pendle.finance/boros-docs/Introduction
- https://docs.pendle.finance/boros-docs/boros-systems/orderbook
- https://docs.pendle.finance/boros-docs/boros-systems/margin-and-liquidations
- https://docs.pendle.finance/boros-docs/boros-systems/fees
- https://docs.pendle.finance/boros-dev/Backend/api
- https://api-boros.pendle.finance/apis/docs

The OpenAPI simulation schema and successful current responses determine the preview integration; no assumption that an overview's older GET example overrides the published POST DTO.
