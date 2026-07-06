---
title: "governor:timelock-schedule"
---

Schedule a batch of actions on a TimelockController. Optionally binds the operation id to a variable for later state checks or cancellation.

## Syntax

```evml
governor:timelock-schedule [variable] <timelock> <delay> <actions>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[variable]` | `variable` | Variable to bind the operation id to |
| `timelock` | `address` | TimelockController address |
| `delay` | `number` | Delay in seconds (at least the timelock minimum delay) |
| `actions` | `block` | Block of commands making up the operation |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--predecessor` | `bytes32` | Operation id that must execute first (default none) |
| `--salt` | `bytes32` | Salt to disambiguate identical operations (default zero) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load governor
load access-control

set $timelock 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1
set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb
set $grantee 0x4F2083f5fBede34C2714aFfb3105539775f7FE64

# Schedule a batch and remember its operation id
governor:timelock-schedule $opId $timelock 172800 (
  exec $token transfer(address,uint256) $grantee 100e18
  access-control:grant $token MINTER_ROLE $grantee
)
print @governor.timelockOperationState($timelock $opId)
```

## Notes

- Requires the PROPOSER_ROLE on the timelock; the delay must be at least
  [@governor.timelockMinDelay](../helpers/governor.timelockMinDelay.md).
- The optional variable is bound to the operation id (hashOperationBatch),
  computed locally without a chain read.
- Use `--salt` to schedule the same batch twice; `--predecessor` orders
  operations.

## See Also

- [governor:timelock-execute](timelock-execute.md) — run it after the delay
- [governor:timelock-cancel](timelock-cancel.md)
