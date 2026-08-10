---
title: "@governor:timelockOperationState"
---

State of a TimelockController operation: Unset, Waiting, Ready or Done.

**On-chain (`@governor:timelockOperationState!`)**: Returns the numeric OperationState (0 Unset, 1 Waiting, 2 Ready, 3 Done), not the name.

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

## On-chain face (@timelockOperationState!)

A nested core `cond` over the timelock's own state views, evaluated at
assertion time: `cond(isOperationDone, 3, cond(isOperationReady, 2,
cond(isOperationPending, 1, 0)))`. The result is OZ's NUMERIC
`OperationState` enum value — the string mapping stays off-chain:

| Value | OperationState | View that selects it |
|-------|----------------|----------------------|
| `3` | Done | `isOperationDone(id)` |
| `2` | Ready | `isOperationReady(id)` |
| `1` | Waiting | `isOperationPending(id)` (pending but not ready) |
| `0` | Unset | none of the above |

### Examples

```evml
load assertions
load governor

set $timelock 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1
set $opId 0x83f6db63dbcae7ea6a625e442c00b74a4707ce6c4a91667c8b5cf01b6f3159a1

# The operation must be Ready (2) when the batch executes
assertions:assert @governor:timelockOperationState!($timelock $opId) == 2 "not ready"
```

### Notes

- The conds are lazy: only the winning branch resolves, so at most
  three views execute (Done short-circuits after one).
- The timelock address and operation id resolve at composition time.

## See Also

- [governor:timelock-schedule](../commands/timelock-schedule.md) — binds `$opId`
- [governor:timelock-execute](../commands/timelock-execute.md)
