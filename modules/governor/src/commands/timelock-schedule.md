---
title: "governor:timelock-schedule"
---

Schedule a batch of actions on a TimelockController. Optionally binds the operation id to a variable for later state checks or cancellation.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: cannot be nested. This command opens a separate atomic execution context; nested atomic blocks are unsupported.

## Syntax

```evml
governor:timelock-schedule [variable] <timelock> <delay> <actions>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `[variable]` | `variable` | Build time | Variable to bind the operation id to |
| `timelock` | `address` | Build time | TimelockController address |
| `delay` | `number` | Build time | Delay, in time units (e.g. 2d; at least the timelock minimum delay) |
| `actions` | `block` | Build time | Block of commands making up the operation |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--predecessor` | `bytes32` | Build time | Operation id that must execute first (default none) |
| `--salt` | `bytes32` | Build time | Salt to disambiguate identical operations (default zero) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load governor
load acl

set $timelock 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1
set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb
set $grantee 0x4F2083f5fBede34C2714aFfb3105539775f7FE64

# Schedule a batch and remember its operation id
governor:timelock-schedule $opId $timelock 2d (
  exec $token transfer(address,uint256) $grantee 100e18
  acl:grant MINTER_ROLE on $token to $grantee
)
print @governor:timelockOperationState($timelock $opId)
```

## Notes

- Requires the PROPOSER_ROLE on the timelock; the delay must be at least
  [@governor:timelockMinDelay](../helpers/timelockMinDelay.md).
- The optional variable is bound to the operation id (hashOperationBatch),
  computed locally without a chain read.
- Use `--salt` to schedule the same batch twice; `--predecessor` orders
  operations.

## See Also

- [governor:timelock-execute](timelock-execute.md) — run it after the delay
- [governor:timelock-cancel](timelock-cancel.md)
