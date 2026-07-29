# swaps module

Token swaps across DEXes: exact-in and exact-out swaps with automatic approvals, wrap/unwrap, quotes and prices, and venue selection via --using.

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
| [swaps:unwrap](src/commands/unwrap.md) | Unwrap the canonical wrapped-native token back into the native token (WETH to ETH, WXDAI to xDAI...). |
| [swaps:wrap](src/commands/wrap.md) | Wrap the native token into its canonical wrapped form (ETH to WETH, xDAI to WXDAI...). |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@swaps:price](src/helpers/price.md) | `number` | Spot price of 1 whole tokenA, expressed in base units of tokenB (the venue quote for selling 1 tokenA). Compare it against @token:amount(tokenB ...) values. |
| [@swaps:quote](src/helpers/quote.md) | `number` | Expected output of an exact-in swap, in base units of tokenOut. Quotes the same venue swap would use (or the one given), so it feeds --min directly. |

