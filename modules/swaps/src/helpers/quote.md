---
title: "@swaps:quote"
---

Expected output of an exact-in swap, in base units of tokenOut. Quotes the same venue swap would use (or the one given), so it feeds --min directly.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@swaps:quote(amountIn tokenIn tokenOut venue?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amountIn` | `number` | Amount of tokenIn to sell, in base units (wei) |
| `tokenIn` | `address` | Token to sell |
| `tokenOut` | `address` | Token to buy |
| `[venue]` | `swap-venue` | Venue to quote (default: the best venue on the chain) |

## Examples

```evml
# Print the expected GNO output for 100 WXDAI (on Gnosis)
print "GNO out:" @swaps:quote(100e18 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb)
```

<!-- HAND-WRITTEN -->

## See Also
