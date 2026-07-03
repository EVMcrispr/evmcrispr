---
title: "@governor:governor.timelockMinDelay"
---

Minimum delay in seconds a TimelockController enforces on new operations.

**Returns**: `number`

## Syntax

```evml
@governor:governor.timelockMinDelay(timelock)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `timelock` | `address` | TimelockController address |

<!-- HAND-WRITTEN -->

## Examples

```evml
load governor

# Schedule with exactly the minimum delay
governor:timelock-schedule $timelock @governor.timelockMinDelay($timelock) (
  exec $token transfer(address,uint256) $grantee 100e18
)
```

## See Also

- [governor:timelock-schedule](../commands/timelock-schedule.md)
