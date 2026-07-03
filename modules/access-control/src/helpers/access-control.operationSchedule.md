---
title: "@access-control:access-control.operationSchedule"
---

Timestamp at which a scheduled AccessManager operation becomes executable (0 when unset, expired or already executed).

**Returns**: `number`

## Syntax

```evml
@access-control:access-control.operationSchedule(manager, operationId)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `manager` | `address` | AccessManager address |
| `operationId` | `bytes32` | Operation id from @access-control.operationId |

<!-- HAND-WRITTEN -->

## Examples

```evml
load access-control

print @access-control.operationSchedule($manager $operationId)
```

## Notes

- Returns 0 when the operation is unset, expired or already executed.

## See Also

- [access-control:schedule](../commands/schedule.md) / [@access-control.operationId](access-control.operationId.md)
