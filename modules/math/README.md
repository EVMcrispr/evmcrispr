# math module

Plain math over numbers: minimum, maximum, absolute difference and integer square root.

```evml
load math
```

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@math:absDiff](src/helpers/absDiff.md) | `number` | Absolute difference |a - b|. |
| [@math:exp](src/helpers/exp.md) | `number` | e raised to a wad-scaled power, in wad (1e18) fixed point. Continuous growth over a period: a rate r compounded continuously multiplies a balance by exp(r). |
| [@math:ln](src/helpers/ln.md) | `number` | The natural logarithm of a wad-scaled value, in wad (1e18) fixed point. The inverse of exp: it turns a growth factor back into the rate that produced it. |
| [@math:log2](src/helpers/log2.md) | `number` | The base-2 logarithm of a whole number, rounded down — the position of its highest set bit, so it also gives a bit length. Undefined at zero. |
| [@math:max](src/helpers/max.md) | `number` | Maximum of two or more values. |
| [@math:min](src/helpers/min.md) | `number` | Minimum of two or more values. |
| [@math:pow](src/helpers/pow.md) | `number` | Raise a fixed-point value to a whole power, where one unit is `base` (1e18 by default, 1e27 for a ray). Compounding a per-period rate over N periods is pow(unit + rate, N). |
| [@math:sqrt](src/helpers/sqrt.md) | `number` | Integer square root (floor). |

