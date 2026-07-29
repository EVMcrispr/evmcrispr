---
title: "@contracts:slot.erc7201"
---

Derive the root slot of an ERC-7201 namespaced storage layout: keccak256(abi.encode(uint256(keccak256(id)) - 1)) & ~0xff.

**Returns**: `bytes32`

## Syntax

```evml
@contracts:slot.erc7201(id)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `id` | `string` | Namespace id, e.g. "openzeppelin.storage.Ownable" |

## Examples

```evml
# Root slot of an ERC-7201 namespaced layout
set $slot @contracts:slot.erc7201("openzeppelin.storage.Ownable")
```

<!-- HAND-WRITTEN -->

## See Also

