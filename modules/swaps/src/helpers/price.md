---
title: "@swaps:price"
---

Spot price of 1 whole tokenA, expressed in base units of tokenB (the venue quote for selling 1 tokenA). Compare it against @token.amount(tokenB ...) values.

**Returns**: `number`

## Syntax

```evml
@swaps:price(tokenA tokenB venue?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `tokenA` | `address` | Token being priced |
| `tokenB` | `address` | Token the price is denominated in |
| `[venue]` | `swap-venue` | Venue to quote (default: the best venue on the chain) |

<!-- HAND-WRITTEN -->

## Examples

```evml
# TODO: add examples
```

## See Also
