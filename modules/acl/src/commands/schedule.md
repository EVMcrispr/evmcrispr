---
title: "acl:schedule"
---

Schedule a delayed operation on an AccessManager for later execution with acl:execute-scheduled.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
acl:schedule <manager> <target> <signature> [...params]
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `manager` | `address` | Runtime in smart blocks | AccessManager address |
| `target` | `address` | Runtime in smart blocks | Managed contract address |
| `signature` | `write-abi` | Build time | Function to call on the target |
| `[...params]` | `any` | Runtime in smart blocks | Arguments matching the signature types |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--when` | `number` | Runtime in smart blocks | Unix timestamp at which the operation becomes executable (default 0 = as soon as the delay allows) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load acl

set $manager 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1
set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb

# Queue a delayed call for as soon as the execution delay allows
acl:schedule $manager $token "setDuration(uint256)" 1y

# Or pick an explicit execution time
acl:schedule $manager $token "setDuration(uint256)" 1y --when 1767225600
```

## Notes

- The sender must hold the role required for the call; scheduling starts the
  execution-delay clock attached to their grant.
- Scheduled operations expire one week after becoming executable.

## See Also

- [acl:execute-scheduled](execute-scheduled.md) — run it once ready
- [acl:cancel-scheduled](cancel-scheduled.md) — cancel it
- [@acl:operationSchedule](../helpers/operationSchedule.md) — check the timer
