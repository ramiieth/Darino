# Persian market identities, Pendle receipt logos and four Lighter views

## Result

- Lighter now has perpetual markets, spot markets, owned assets and Robinhood tabs. `/lighter` opens mainnet perpetuals; the existing `/lighter-robinhood` link still opens Robinhood. Changing routes resets the initial tab correctly.
- Mainnet reads use the fixed public `mainnet.zklighter.elliot.ai` host; Robinhood uses `api.rh.lighter.xyz`. Saved account connections, query caches and quote units are separate. No API secret, SDK, signer or transaction execution was introduced.
- The assets tab reads the connected account's actual `assets` and positions, including separate reported balance, locked balance and margin balance. The market universe is never turned into wallet holdings. The provider's equity stays authoritative; spot balances are not added to it a second time.
- Lighter and Ondo market lists refresh every minute while their view is active. Account reads refresh every 30 seconds. Arcus market metadata is now refreshed through its existing visible-page polling, respecting its ten-minute market cache.
- Known market names are Persian; official full names remain available when a translation is not yet known. A ticker spelled letter by letter is only a secondary identifier, not an invented asset name. Search matches both original symbols and Persian display names. Original identifiers remain unchanged for APIs and storage.
- Market icons prefer provider-supplied approved URLs and the reviewed Lighter asset mapping. Missing images use the existing asset-logo sources or a Persian fallback. An icon cannot be guaranteed for a future asset before a source publishes it.
- Numbers use the application's Persian-digit formatter. Units are Persian. Mainnet spot quote labels follow the pair's quote symbol; Robinhood USDG and mainnet USDC remain distinct.

## Receipt logos

The initial registry was generated from 811 official Pendle markets on 2026-10-07, including expired markets. Each LP/PT/YT contract is matched by **chain ID and contract address**, then uses the market's original underlying-token icon. Token symbols are not used to guess an underlying contract. Wallet provider logos remain a fallback if metadata is unavailable.

A small **English YT/PT/LP badge sits beside the underlying icon**. The underlying name is English and single-line; Solar Hijri maturity remains visible separately. Persian receipt-kind spellings are removed. Receipt quantities contain the number only, with desktop padding reset by the panel-width layout rule. Positions, activity, asset selection and cost-basis displays share this rendering.

The authenticated `pendle-logos` read route retrieves all pages from the fixed public Pendle endpoint, caches the complete registry and refreshes it after 15 minutes. The client refreshes every 15 minutes while a receipt logo is mounted and retains prior metadata on outages. It does not run while the application is closed. New markets require no symbol-specific code changes. Directory chain IDs are retained so additional supported networks can resolve contract identities too.

Only existing owned positions are displayed in the dashboard/portfolio: positive quantities and the existing YT > $4, PT/LP > $2 rules remain in place. Downloading metadata never creates holdings or purchase records.

## Validation

All 1,351 tests across 128 files passed. Production build passed. Mocked browser checks covered mobile/desktop layout, adding/persisting/removing accounts, all four tabs, mainnet/Robinhood isolation, Persian prices, a downloaded official Apple logo and receipt badges in the dashboard. Long sUSDat receipt labels and large balances were checked at 390, 768 and 1440 pixels, including desktop quantity padding. No real wallet or credentials were submitted in browser QA.

## Full market names

Lighter market reads also retrieve the same host's public `/api/v1/tokenlist` for current full names and logo filenames. Failure of optional metadata does not suppress market prices. Ondo adapters retain `longName`; Arcus uses `fullAssetName`. Shared names cover the reviewed active market inventory, including Eigen, Worldcoin, Bittensor and Aerodrome. Full provider names distinguish reused symbols such as Quant and Quantinuum. English originals remain available for search, and new unknown names are shown as published instead of being reduced to spelled tickers.

The public inventory fixture records symbol/name pairs from the four hosts on 2026-10-07, not user accounts or balances.

## Sources

- [Pendle market/asset API](https://api-v2.pendle.finance/core/docs)
- [Pendle API overview](https://docs.pendle.finance/pendle-v2-dev/Backend/ApiOverview)
- [Official Lighter SDK account asset schema](https://github.com/elliottech/lighter-python/blob/main/lighter/models/account_asset.py)
- [Official Lighter mainnet application](https://app.lighter.xyz/trade/LIT_USDC)
- Lighter logo mapping: public frontend `assets/dist-D_7yJdBU.js`, downloaded as text and inspected; never executed.
- Market logo fixture: https://assets.lighter.xyz/fe/token/aapl.svg

- Public inventories: `https://mainnet.zklighter.elliot.ai/api/v1/tokenlist`, `https://api.rh.lighter.xyz/api/v1/tokenlist`, `https://api.arcus.xyz/v1/markets`, `https://api.ondoperps.xyz/v1/markets`.
- [Official Eigen token identity](https://docs.eigenfoundation.org/eigen-token/token).
