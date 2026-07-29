---
title: "@contracts:slot.mapping"
---

Derive the storage slot of mapping[key] for a mapping declared at a base slot: keccak256(h(key) . base).

**Returns**: `bytes32`

## Syntax

```evml
@contracts:slot.mapping(base key)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `base` | `bytes32` | Declared slot of the mapping |
| `key` | `any` | Mapping key |

## Examples

```evml
# Slot of balanceOf[account] for a mapping at slot 3
set $slot @contracts:slot.mapping(3 0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6)
```

<!-- HAND-WRITTEN -->

## See Also

