---
title: "@assertions:at!"
---

Extract a raw 32-byte word from the return data of a call by word index, on-chain. Raw layout, not decoded — for dynamic-array elements use a nested lens like [[_ $]] instead. A negative index counts from the end (-1 = last word).

**Returns**: `number`

## Syntax

```evml
@assertions:at!(call index)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `call` | `any` | A `::` call expression (or chain) to read |
| `index` | `number` | 32-byte word index into the raw return data: zero-based from the start, negative from the end (-1 = last) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

set $pool 0x44fA8E6f47987339850636F88629646662444217

# Word 1 of getReserves() is reserve1
assertions:assert @at!($pool::{getReserves()(uint112,uint112,uint32)} 1) > 0

# Last raw word of the returndata (negative index counts from the end)
assertions:assert @at!($pool::{getReserves()(uint112,uint112,uint32)} -1) > 0
```

## Notes

- Raw word extraction, NOT an ABI decoder: word positions follow the raw
  encoding, so dynamic types contribute head offsets, not their content
  (a `T[]` return is offset word, length word, then the items). To select
  a dynamic-array ELEMENT, use a nested lens instead — it follows the
  offset and bounds-checks against the live length:
  `$safe::{getOwners()(address[])}[[_ $]] == @me`.
- Negative indices resolve against the word count at assertion time, so
  `-1` is the last word however long the live returndata is.

## See Also

- [assertions:assert](../commands/assert.md), [@assertions:len!](len.md)
