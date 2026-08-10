---
title: "@math:log2"
---

The base-2 logarithm of a whole number, rounded down — the position of its highest set bit, so it also gives a bit length. Undefined at zero.

**Returns**: `number`

## Syntax

```evml
@math:log2(value)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `number` | Whole number above zero |

<!-- HAND-WRITTEN -->

## Examples

```evml
# TODO: add examples
```

## See Also

## On-chain face (@math:log2!)

`floor(log2(x))` as one `log2` read — the integer bit position, not a
fixed-point logarithm. `@log2!(8)` is `3`.

Unsigned only: an `Int` operand is rejected at composition time, because a
negative value has no logarithm and the word would otherwise be read as a very
large unsigned number.

### Notes

- Truncates towards zero; use `@ln!` for a fixed-point logarithm.
