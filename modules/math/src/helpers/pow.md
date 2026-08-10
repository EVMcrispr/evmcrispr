---
title: "@math:pow"
---

Raise a fixed-point value to a whole power, where one unit is `base` (1e18 by default, 1e27 for a ray). Compounding a per-period rate over N periods is pow(unit + rate, N).

**On-chain (`@math:pow!`)**: A value carrying a scale other than a wad must state its unit, since the plain face cannot see a scale and would compound at 1e18.

**Returns**: `number`

## Syntax

```evml
@math:pow(value exponent base?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `number` | The fixed-point value to raise |
| `exponent` | `number` | Whole exponent |
| `[base]` | `number` | One unit of the value, e.g. 1e18 or 1e27 (default: 1e18) |

<!-- HAND-WRITTEN -->

## Examples

```evml
# Compound a 5% per-period rate over 12 periods, wad-scaled
set $growth @math:pow(1.05e18 12)
print $growth
```

## See Also

## On-chain face (@math:pow!)

Compiles to the Operators contract's `rpow(x, n, base)`, the fixed-point
exponentiation by squaring the rest of the fixed-point family uses.

Two things it refuses rather than answering:

- **Signed operands.** Both the value and the exponent must be unsigned.
- **A scaled value whose unit it would have to guess.** When the operand
  carries a scale of its own (a ray read, say) and no `base` argument is
  given, the on-chain face could take the unit from that scale — but a
  `Num` carries no scale, so the plain face cannot see it and always
  compounds at 1e18. The two faces would then disagree by orders of
  magnitude on the same source text, so the on-chain face asks for the unit
  instead: `@pow!(value exponent 1e27)`. A wad-scaled operand needs no
  argument, since that is the default on both sides.

The `base` argument itself is resolved at composition time, so it must be a
literal unit rather than a live read. When both the value and the exponent
are constants the whole call folds at composition time and no read is
emitted at all.
