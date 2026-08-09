# math module

Plain math over numbers: composable off-chain as @min, @max, @absdiff and @sqrt, and on-chain at execution time via the `!` faces.

```evml
load math
```

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@math:absdiff](src/helpers/absdiff.md) | `number` | Absolute difference |a - b|: plain @absdiff computes off-chain, @absdiff! on-chain where it never underflows; `@absdiff!(a b) <= d` is the composable approximate-equality. |
| [@math:max](src/helpers/max.md) | `number` | Maximum of two or more values: plain @max computes off-chain, @max! on-chain at execution time. |
| [@math:min](src/helpers/min.md) | `number` | Minimum of two or more values: plain @min computes off-chain, @min! on-chain at execution time. |
| [@math:sqrt](src/helpers/sqrt.md) | `number` | Integer square root (floor): plain @sqrt computes off-chain, @sqrt! on-chain, the AMM invariant form, e.g. @sqrt!($pool::reserve0() * $pool::reserve1()). |

