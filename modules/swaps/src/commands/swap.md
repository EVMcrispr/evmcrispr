---
title: "swaps:swap"
---

Sell an exact amount of one token for another on a DEX or aggregator, approving the venue automatically when needed. Slippage protection comes from --min, or --slippage applied to a quote (default 0.5%).

## Syntax

```evml
swaps:swap <amount> <tokenIn> <to> <tokenOut>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amount` | `number` | Amount of tokenIn to sell, in base units (wei) |
| `tokenIn` | `address` | Token to sell (use @token(SYM); the native token resolves to the zero address) |
| `to` | `command` | Keyword `to` |
| `tokenOut` | `address` | Token to buy |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--min` | `number` | Minimum output in base units (overrides --slippage) |
| `--slippage` | `number` | Maximum slippage vs. the quote, in percent (default 0.5) |
| `--using` | `swap-venue` | Venue: Delora, UniswapV4, UniswapV3, UniswapV2, Honeyswap, SushiSwap, Balancer, or CoWSwap (default: the best venue available on the chain) |
| `--to` | `address` | Recipient of the output (defaults to the connected account) |
| `--deadline` | `number` | Unix timestamp after which the swap reverts (default: 20 minutes after the latest block) |
| `--no-approve` | `bool` | Skip the automatic allowance check and approve action |

## Examples

```evml
# Swap 100 WXDAI for GNO on Honeyswap (Gnosis)
swaps:swap 100e18 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d to 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb --using Honeyswap

# Swap using the chain default venue, capping slippage at 1% of the quote
swaps:swap 100e18 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d to 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb --slippage 1

# Swap 1 xDAI (native) for GNO, protected by @swaps.quote
swaps:swap 1e18 0x0000000000000000000000000000000000000000 to 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb --min @swaps.quote(1e18 0x0000000000000000000000000000000000000000 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb)
```

<!-- HAND-WRITTEN -->

## See Also
