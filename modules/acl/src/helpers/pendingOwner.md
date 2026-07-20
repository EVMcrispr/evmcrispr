---
title: "@acl:pendingOwner"
---

Pending owner of an Ownable2Step contract (the zero address when no transfer is in progress).

**Returns**: `address`

## Syntax

```evml
@acl:pendingOwner(contract)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `contract` | `address` | Ownable2Step contract address |

<!-- HAND-WRITTEN -->

## Examples

```evml
load acl

set $contract 0x44fA8E6f47987339850636F88629646662444217
print @acl:pendingOwner($contract)
```

## Notes

- Returns the zero address when no two-step transfer is in progress.

## See Also

- [acl:accept-ownership](../commands/accept-ownership.md)
