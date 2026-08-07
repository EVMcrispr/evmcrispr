---
title: "@assertions:split!"
---

Split the string return of a call on a delimiter and select one segment, on-chain. Compare the result at the top level of an assertion.

**Returns**: `string`

## Syntax

```evml
@assertions:split!(call delimiter index)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `call` | `any` | A `::` call expression (or chain) returning a string |
| `delimiter` | `string` | Exact, non-empty byte sequence to split on |
| `index` | `number` | Zero-based segment index to select |

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

set $pool 0x44fA8E6f47987339850636F88629646662444217

# "Uniswap LP Token" -> segment 1 is "LP"
assertions:assert @split!($pool::{name()(string)} " " 1) == "LP"
```

## Notes

- Splits on the exact byte sequence; adjacent delimiters produce empty
  segments and an out-of-range index reverts with SegmentIndexOutOfBounds.
- String-valued, so it can only be judged at the top level with `==`/`!=`.

## See Also

- [assertions:assert](../commands/assert.md), [@assertions:hash!](hash.md)
