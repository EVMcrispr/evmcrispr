---
title: "access-control:schedule"
---

Schedule a delayed operation on an AccessManager for later execution with access-control:execute-scheduled.

## Syntax

```evml
access-control:schedule <manager> <target> <signature> [...params]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `manager` | `address` | AccessManager address |
| `target` | `address` | Managed contract address |
| `signature` | `write-abi` | Function to call on the target |
| `[...params]` | `any` | Arguments matching the signature types |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--when` | `number` | Unix timestamp at which the operation becomes executable (default 0 = as soon as the delay allows) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load access-control

set $manager 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1
set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb

# Queue a delayed call for as soon as the execution delay allows
access-control:schedule $manager $token "setDuration(uint256)" 31536000

# Or pick an explicit execution time
access-control:schedule $manager $token "setDuration(uint256)" 31536000 --when 1767225600
```

## Notes

- The sender must hold the role required for the call; scheduling starts the
  execution-delay clock attached to their grant.
- Scheduled operations expire one week after becoming executable.

## See Also

- [access-control:execute-scheduled](execute-scheduled.md) — run it once ready
- [access-control:cancel-scheduled](cancel-scheduled.md) — cancel it
- [@access-control:operationSchedule](../helpers/operationSchedule.md) — check the timer
