# Perpetual platform identity and Ondo API connection

- Lighter Robinhood is shown as «لایتر رابین‌هود» / Lighter, with its official platform logo and Robinhood Chain badge (chain 4663).
- Ondo is shown as «اوندو پرپس» / Ondo Perps with its official logo. Its documented funding networks are Ethereum and Arbitrum; a Robinhood deployment was not verified. Network labels identify supported funding routes, not a position's execution chain.
- Lighter logo source: https://robinhoodchain.lighter.xyz/apple-touch-icon.png
- Ondo logo source: https://app.ondoperps.xyz/favicons/apple-touch-icon.png
- Official architecture: https://docs.ondoperps.xyz/architecture.md

The user configured a read-only API key identifier as `Ondo_API_KEY`, and requested no `Ondo_API_SECRET`. No secret or wallet private key is added or requested by the application. Current official authentication documentation states that the key ID alone is insufficient: requests use ONDO-KEY-ID, ONDO-TIMESTAMP and ONDO-SIGN (HMAC-SHA256 generated with a separate API secret). API secrets are distinct from wallet private keys.

Source: https://docs.ondoperps.xyz/api-reference/api_key_authentication.md

The official app's API-key interface includes View Only as distinct from View/Trade and View/Transfer; its create-key dialog also displays API Key and API Secret separately. The specific configured key's permissions were not accessed, and a single-ID authentication alternative was not found. Therefore no speculative Bearer-token or unauthenticated private-balance requests are added. The module continues to show public markets and links to the official account page; private balance integration remains pending a documented authentication method compatible with the user's constraint.
