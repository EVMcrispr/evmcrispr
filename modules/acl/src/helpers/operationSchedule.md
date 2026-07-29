---
title: "@acl:operationSchedule"
---

Timestamp at which a scheduled AccessManager operation becomes executable (0 when unset, expired or already executed).

**Returns**: `number`

## Syntax

```evml
@acl:operationSchedule(manager operationId)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `manager` | `address` | AccessManager address |
| `operationId` | `bytes32` | Operation id from @acl:operationId |

<!-- HAND-WRITTEN -->

## Examples

```evml
load acl

set $manager 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1
set $operationId 0x83f6db63dbcae7ea6a625e442c00b74a4707ce6c4a91667c8b5cf01b6f3159a1

print @acl:operationSchedule($manager $operationId)
```

## Notes

- Returns 0 when the operation is unset, expired or already executed.

## See Also

- [acl:schedule](../commands/schedule.md) / [@acl:operationId](operationId.md)
