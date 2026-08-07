---
title: "@assertions:max!"
---

Maximum of two or more values, computed on-chain at assertion time.

**Returns**: `number`

## Syntax

```evml
@assertions:max!(...values)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[...values]` | `number` | Two or more numeric operands (or one array of them) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

set $vault 0x0102030405060708090a0b0c0d0e0f1011121314

assertions:assert @max!($vault::{a()(uint256)} $vault::{b()(uint256)}) > 0
```

## See Also

- [@assertions:min!](min-bang.md), [@assertions:absdiff!](absdiff-bang.md)
