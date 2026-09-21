# swaps module

Token swaps across DEXes, plus CoW TWAP orders from wallets and DAOs through reusable Safe accounts, with quotes, approvals, wrap/unwrap, and provider selection.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

```evml
load swaps
```

## Configuration variables

Config variables are set with `set` (fully qualified, including the module prefix) and are only readable by their own module and the user script.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `$swaps:deloraApiKey` | `string` | — | API key for the Delora swap venue. |

## Commands

| Command | Description |
|---------|-------------|
| [swaps:swap](src/commands/swap.md) | Sell an exact amount of one token for another on a DEX or aggregator, approving the venue automatically when needed. Slippage protection comes from --min, or --slippage applied to a quote (default 0.5%). |
| [swaps:swap-to](src/commands/swap-to.md) | Buy an exact amount of a token, spending as little as possible of another. The input is capped by --max, or --slippage applied to a quote (default 0.5%). Unspent input is refunded by the venue. |
| [swaps:twap](src/commands/twap.md) | Sell tokens in equal timed parts through CoW from a reusable Safe controlled by @sender. Requires --parts, --every and exactly one of --min or --price-protection. Live preflight is required unless --offline is explicit. |
| [swaps:twap-cancel](src/commands/twap-cancel.md) | Cancel a CoW TWAP and revoke its sell-token allowance. Cancellation takes effect when mined; use twap-recover afterwards to return unused tokens. |
| [swaps:twap-recover](src/commands/twap-recover.md) | Return residual TWAP sell tokens after cancellation, expiry, or proven complete settlement, removing authorization and clearing the allowance. Reads the current balance; run after prior actions are mined. |
| [swaps:unwrap](src/commands/unwrap.md) | Unwrap the canonical wrapped-native token back into the native token (WETH to ETH, WXDAI to xDAI...). |
| [swaps:wrap](src/commands/wrap.md) | Wrap the native token into its canonical wrapped form (ETH to WETH, xDAI to WXDAI...). |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@swaps:price](src/helpers/price.md) | `number` | Spot price of 1 whole tokenA, expressed in base units of tokenB (the venue quote for selling 1 tokenA). Compare it against @token:amount(tokenB ...) values. |
| [@swaps:quote](src/helpers/quote.md) | `number` | Expected output of an exact-in swap, in base units of tokenOut. Quotes the same venue swap would use (or the one given), so it feeds --min directly. |
| [@swaps:twapParts](src/helpers/twapParts.md) | `string` | JSON page of TWAP parts with exact UIDs, trading windows, submission observations and verified settlement receipts. Offset defaults to 0; limit defaults to 100 (maximum 128). |
| [@swaps:twapStatus](src/helpers/twapStatus.md) | `string` | JSON TWAP status: independent registration, schedule, verified settlement totals, evidence coverage/finality, indexer discovery and current-part submission. Incomplete history reports unknown; expiry never proves fills. |

