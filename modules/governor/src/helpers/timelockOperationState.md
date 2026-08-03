---
title: "@governor:timelockOperationState"
---

State of a TimelockController operation: Unset, Waiting, Ready or Done.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `string`

## Syntax

```evml
@governor:timelockOperationState(timelock operationId)
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

set $timelock 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1
set $opId 0x83f6db63dbcae7ea6a625e442c00b74a4707ce6c4a91667c8b5cf01b6f3159a1

print @governor:timelockOperationState($timelock $opId)
```

## Notes

- Returns `Unset`, `Waiting`, `Ready` or `Done`, derived from the operation
  timestamp (works on all TimelockController versions).

## See Also

- [governor:timelock-schedule](../commands/timelock-schedule.md) — binds `$opId`
- [governor:timelock-execute](../commands/timelock-execute.md)
