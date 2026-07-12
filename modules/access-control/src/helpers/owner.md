---
title: "@access-control:owner"
---

Current owner of an Ownable contract.

**Returns**: `address`

## Syntax

```evml
@access-control:owner(contract)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `contract` | `address` | Ownable contract address |

<!-- HAND-WRITTEN -->

## Examples

```evml
load access-control

set $owner @access-control:owner(0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72)
print $owner
```

## See Also

- [access-control:transfer-ownership](../commands/transfer-ownership.md)
- [@access-control:pendingOwner](pendingOwner.md)
