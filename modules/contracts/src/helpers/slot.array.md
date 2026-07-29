---
title: "@contracts:slot.array"
---

Derive the storage slot of element index of a dynamic array declared at a base slot: keccak256(base) + index.

**Returns**: `bytes32`

## Syntax

```evml
@contracts:slot.array(base index)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `base` | `bytes32` | Declared slot of the array |
| `index` | `number` | Element index |

## Examples

```evml
# Slot of the first element of a dynamic array at slot 2
set $slot @contracts:slot.array(2 0)
```

<!-- HAND-WRITTEN -->

## See Also

