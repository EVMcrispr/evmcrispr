---
title: "swaps:swap-to"
---

Buy an exact amount of a token, spending as little as possible of another. The input is capped by --max, or --slippage applied to a quote (default 0.5%). Unspent input is refunded by the venue.

## Syntax

```evml
swaps:swap-to <amountOut> <tokenOut> <from> <tokenIn>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amountOut` | `number` | Exact amount of tokenOut to buy, in base units (wei) |
| `tokenOut` | `address` | Token to buy |
| `from` | `command` | Keyword `from` |
| `tokenIn` | `address` | Token to spend (use @token(SYM); the native token resolves to the zero address) |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--max` | `number` | Maximum input in base units (overrides --slippage) |
| `--slippage` | `number` | Maximum slippage vs. the quote, in percent (default 0.5) |
| `--using` | `swap-venue` | Venue: Delora, UniswapV3, UniswapV2, Honeyswap, SushiSwap, or CoWSwap (default: the best venue available on the chain) |
| `--to` | `address` | Recipient of the output (defaults to the connected account) |
| `--deadline` | `number` | Unix timestamp after which the swap reverts (default: 20 minutes after the latest block) |
| `--no-approve` | `bool` | Skip the automatic allowance check and approve action |

## Examples

```evml
# Buy exactly 1 GNO with WXDAI on Honeyswap (Gnosis), spending at most the quote plus 0.5%
swaps:swap-to 1e18 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb from 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d --using Honeyswap
```

<!-- HAND-WRITTEN -->

## See Also
