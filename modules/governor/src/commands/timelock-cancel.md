---
title: "governor:timelock-cancel"
---

Cancel a pending TimelockController operation. The sender needs the CANCELLER_ROLE.

## Syntax

```evml
governor:timelock-cancel <timelock> <operationId>
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

governor:timelock-schedule $opId $timelock 172800 (
  exec $token transfer(address,uint256) $grantee 100e18
)
governor:timelock-cancel $timelock $opId
```

## Notes

- Requires the CANCELLER_ROLE; only pending (not yet executed) operations
  can be cancelled.

## See Also

- [governor:timelock-schedule](timelock-schedule.md) — binds the operation id
