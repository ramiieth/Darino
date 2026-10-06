# Lighter Agent Kit: static review and Darino integration

Reviewed 2026-10-07. Scope: `elliottech/lighter-agent-kit` commit `9798b37230d631b4a09a5a28d2436f5405a00992`, installer, configuration tool, scripts, dependency manifest, and signer-loading source in the dependency `elliottech/lighter-python` pinned at `6957dd8a1b36894ca9580be0d51de30aeea3bd4a`.

## Conclusion

No obvious browser-profile theft, Chrome-extension scraping, macOS Keychain access, seed-phrase discovery, or automatic exfiltration to an attacker-controlled endpoint was found in the inspected kit source. This is **not a guarantee that installation is safe**: transitive packages, build tooling, and native signer binaries were not independently verified or executed. Neither the installer nor upstream Python code was run; no keys or personal browser files were accessed.

## Security-relevant findings

- `install.sh` downloads Gum v0.14.5 and runs it without checksum verification; clones the kit's moving default branch rather than pinning a release commit. It can offer Python installation via package managers and install skills into agent directories. Review an immutable release before executing an installer.
- `scripts/_sdk.py` automatically invokes pip on first SDK use. SDK source is pinned to a Git commit and other packages have version pins, but installation does not use `--require-hashes`; source builds can execute build tooling. Even bootstrap/health should not be treated as passive inspection.
- `lighter-config` and the installer save credentials in `~/.lighter/lighter-agent-kit/credentials`, with restrictive mode 0600. This is plaintext storage, not Keychain encryption. Redacting Python representations does not protect secrets from local processes running as the same user.
- SDK initialization accepts `LIGHTER_HOST` overrides. A misconfigured host can direct requests away from the intended deployment. Darino uses fixed official hosts and does not accept an arbitrary upstream URL.
- `scripts/trade.py` supports orders, collateral changes, withdrawals, and transfers. These are financial capabilities, even when the code is legitimate. No hardcoded attacker destination or automatic withdrawal was identified in reviewed kit source. Do not give an autonomous agent signing keys merely to display a portfolio.
- Pinned SDK `lighter/signer_client.py` loads platform-specific `.dylib`/`.so`/`.dll` files through `ctypes.CDLL` and passes private keys into native signing. Their behavior cannot be established by reviewing the Python wrapper. No reverse engineering, sandbox execution, reproducible-build comparison, or exhaustive dependency audit was performed.

## Integration implemented

Darino does **not** install/import the agent kit or SDK. Existing authenticated `/api/integrations` handles only fixed public GET endpoints, disallows redirects, enforces timeouts, validates EVM addresses, and bounds pagination. No private key, API secret, wallet-signing request, trading command, withdrawal, or browser-extension access is added.

Lighter Robinhood uses `https://api.rh.lighter.xyz`, separate from Lighter mainnet. Public address lookup displays all returned active subaccounts, their equity/available balance and open positions. Account ownership is checked client-side before display; duplicates and closed positions are removed. Position notional is not added to equity. USDG values remain separate from the dashboard USD aggregate.

Ondo uses public `/v1/markets` and `/v1/perps/mark_prices`. Private balance/positions require authenticated access under the official spec. This release adds public markets and the official account link, not a private account connection. A later private integration needs a separately designed explicit signing/authentication flow with scoped authorization; do not use the Lighter agent kit for Ondo.

## Evidence

- [Reviewed kit commit](https://github.com/elliottech/lighter-agent-kit/tree/9798b37230d631b4a09a5a28d2436f5405a00992)
- [Installer](https://github.com/elliottech/lighter-agent-kit/blob/9798b37230d631b4a09a5a28d2436f5405a00992/install.sh)
- [SDK bootstrap and credentials](https://github.com/elliottech/lighter-agent-kit/blob/9798b37230d631b4a09a5a28d2436f5405a00992/scripts/_sdk.py)
- [Trading capabilities](https://github.com/elliottech/lighter-agent-kit/blob/9798b37230d631b4a09a5a28d2436f5405a00992/scripts/trade.py)
- [Dependency pins](https://github.com/elliottech/lighter-agent-kit/blob/9798b37230d631b4a09a5a28d2436f5405a00992/requirements.lock)
- [Pinned native signer loader](https://github.com/elliottech/lighter-python/blob/6957dd8a1b36894ca9580be0d51de30aeea3bd4a/lighter/signer_client.py)
- [Robinhood official Lighter domains](https://docs.robinhood.com/chain/lighter-domains/)
- [Ondo official API specification](https://docs.ondoperps.xyz/api-reference/rest-spec.json)

Results apply only to the inspected commits and scope, not to future versions or a guarantee against compromise.
