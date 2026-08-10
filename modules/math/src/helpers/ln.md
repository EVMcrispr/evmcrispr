---
title: "@math:ln"
---

The natural logarithm of a wad-scaled value, in wad (1e18) fixed point. The inverse of exp: it turns a growth factor back into the rate that produced it.

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

Natural log in wad fixed point, as one `lnWad` read. Signed (`Int`), scale 18,
so it is the inverse of `@exp!` at the same unit.

A constant at or below zero is rejected at composition time, where the message
can name the helper. A LIVE value that turns out to be zero cannot be caught
there and reverts when the assertion is judged.

### Notes

- The domain check only fires for constants; a live zero reverts on-chain.
