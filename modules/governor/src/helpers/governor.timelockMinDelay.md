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

set $timelock 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1
set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb
set $grantee 0x4F2083f5fBede34C2714aFfb3105539775f7FE64

# Schedule with exactly the minimum delay
governor:timelock-schedule $opId $timelock @governor.timelockMinDelay($timelock) (
  exec $token transfer(address,uint256) $grantee 100e18
)
```

## See Also

- [governor:timelock-schedule](../commands/timelock-schedule.md)
