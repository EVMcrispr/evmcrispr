---
title: "@math:ln"
---

The natural logarithm of a wad-scaled value, in wad (1e18) fixed point. The inverse of exp: it turns a growth factor back into the rate that produced it.

**On-chain (`@math:ln!`)**: Accepts live values and carries the result’s wad scale for surrounding arithmetic.

**Returns**: `number`

## Syntax

```evml
@math:ln(value)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `number` | Wad-scaled value, strictly above zero |

<!-- HAND-WRITTEN -->

## Examples

```evml
# TODO: add examples
```

## See Also

## On-chain face (@math:ln!)

Only values known before execution are supported. The result is calculated
ahead of time and carries a signed wad scale of 18. Live operands are rejected.
