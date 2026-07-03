---
title: "@governor:governor.timelockOperationState"
---

State of a TimelockController operation: Unset, Waiting, Ready or Done.

**Returns**: `string`

## Syntax

```evml
@governor:governor.timelockOperationState(timelock, operationId)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `timelock` | `address` | TimelockController address |
| `operationId` | `bytes32` | Operation id (bound by governor:timelock-schedule) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load governor

print @governor.timelockOperationState($timelock $opId)
```

## Notes

- Returns `Unset`, `Waiting`, `Ready` or `Done`, derived from the operation
  timestamp (works on all TimelockController versions).

## See Also

- [governor:timelock-schedule](../commands/timelock-schedule.md) — binds `$opId`
- [governor:timelock-execute](../commands/timelock-execute.md)
