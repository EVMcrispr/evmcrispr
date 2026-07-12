---
title: "@access-control:operationSchedule"
---

Timestamp at which a scheduled AccessManager operation becomes executable (0 when unset, expired or already executed).

**Returns**: `number`

## Syntax

```evml
@access-control:operationSchedule(manager operationId)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `manager` | `address` | AccessManager address |
| `operationId` | `bytes32` | Operation id from @access-control:operationId |

<!-- HAND-WRITTEN -->

## Examples

```evml
load access-control

set $manager 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1
set $operationId 0x83f6db63dbcae7ea6a625e442c00b74a4707ce6c4a91667c8b5cf01b6f3159a1

print @access-control:operationSchedule($manager $operationId)
```

## Notes

- Returns 0 when the operation is unset, expired or already executed.

## See Also

- [access-control:schedule](../commands/schedule.md) / [@access-control:operationId](operationId.md)
