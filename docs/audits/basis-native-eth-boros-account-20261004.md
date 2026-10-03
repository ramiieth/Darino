# Native ETH purchase basis and Boros account selection

## Findings and changes

- Dashboard cost rows excluded wallet-native assets lacking both `tokenId` and `contract`. Include trusted catalog-native holdings and resolve their canonical fungible identity from the reviewed catalog. Native ETH across Ethereum/Base matches existing Ethereum purchase costs; the spam and $2 display policy remains unchanged.
- Cost confirmation was disabled for cached snapshots, including quota-limited wallets. Explicit checkbox confirmation now saves the cost against the displayed cached quantity. These entries remain pending and do not report live PnL until the user reconfirms a fresh balance. Reconfirmation archives the previous entry. Changed quantities and incomplete holding snapshots remain blocked.
- Separate wallets currently holding the asset from wallets with historical transfers. Incomplete historical-only sources cannot disable cost editing; FIFO history requirements still apply to valuation.
- The supplied Boros screenshot contains the specific warning emitted for a nonzero account ID. Read-only public main-account discovery returned 0.021 WETH with no positions for the user-provided root wallet. This is the provider-reported snapshot, not a guarantee of the latest on-chain state.
- Boros account selection is preserved. The portfolio heading identifies the selected account, and a subaccount banner provides an explicit switch to the main account. Clearing a connection resets the form account ID to zero. Main-account collateral is never silently merged into subaccount totals.

## Verification

- 110 test files / 1,243 tests passed; client/server TypeScript and production PWA build passed.
- Browser QA passed with synthetic data, external traffic blocked: Persian decimal cost entry, native ETH without ID, cached-cost opt-in and fresh reconfirmation, quantity-change guard, independent wallet/Arcus/Boros scopes; 320/390/768/1280/1440 layouts, light/dark and touch.
- Boros browser QA covers empty subaccount selection, explicit main-account recovery and deposited collateral with no positions, alongside seven account tabs and readonly official order preview.
- Production deployment, live Gemini and an installed-device PWA were not exercised. No private key, trade, signing, environment change or paid Zerion plan is required by this change.

## References

https://api-boros.pendle.finance/apis/docs
https://docs.pendle.finance/boros-dev/Backend/api
The OpenAPI description for `/v1/accounts/market-acc-infos-by-root` enumerates only `accountId = 0`; other subaccounts require their own explicit handles.
