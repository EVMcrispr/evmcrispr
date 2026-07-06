---
title: "@access-control:access-control.pendingOwner"
---

Pending owner of an Ownable2Step contract (the zero address when no transfer is in progress).

**Returns**: `address`

## Syntax

```evml
@access-control:access-control.pendingOwner(contract)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `contract` | `address` | Ownable2Step contract address |

<!-- HAND-WRITTEN -->

## Examples

```evml
load access-control

set $contract 0x44fA8E6f47987339850636F88629646662444217
print @access-control.pendingOwner($contract)
```

## Notes

- Returns the zero address when no two-step transfer is in progress.

## See Also

- [access-control:accept-ownership](../commands/accept-ownership.md)
