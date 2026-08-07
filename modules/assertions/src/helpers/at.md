---
title: "@assertions:at!"
---

Extract a raw 32-byte word from the return data of a call by word index, on-chain. Static layouts only — dynamic types contribute head offsets, not values.

**Returns**: `number`

## Syntax

```evml
@assertions:at!(call index)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `call` | `any` | A `::` call expression (or chain) to read |
| `index` | `number` | Zero-based 32-byte word index into the raw return data |

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

set $pool 0x44fA8E6f47987339850636F88629646662444217

# Word 1 of getReserves() is reserve1
assertions:assert @at!($pool::{getReserves()(uint112,uint112,uint32)} 1) > 0
```

## See Also

- [assertions:assert](../commands/assert.md), [@assertions:len!](len.md)
