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
