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
# TODO: add examples
```

## See Also
