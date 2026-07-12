---
title: "@swaps:swaps.quote"
---

Expected output of an exact-in swap, in base units of tokenOut. Quotes the same venue swap would use (or the one given), so it feeds --min directly.

**Returns**: `number`

## Syntax

```evml
@swaps:swaps.quote(amountIn tokenIn tokenOut venue?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amountIn` | `number` | Amount of tokenIn to sell, in base units (wei) |
| `tokenIn` | `address` | Token to sell |
| `tokenOut` | `address` | Token to buy |
| `[venue]` | `swap-venue` | Venue to quote (default: the best venue on the chain) |

<!-- HAND-WRITTEN -->

## Examples

```evml
# TODO: add examples
```

## See Also
