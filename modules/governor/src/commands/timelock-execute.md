---
title: "governor:timelock-execute"
---

Execute a ready TimelockController operation. Takes the same action block, predecessor and salt used in governor:timelock-schedule.

## Syntax

```evml
governor:timelock-execute <timelock> <actions>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `timelock` | `address` | TimelockController address |
| `actions` | `block` | Block of commands making up the operation |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--predecessor` | `bytes32` | Operation id that must execute first (default none) |
| `--salt` | `bytes32` | Salt used when scheduling (default zero) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load governor
load access-control

governor:timelock-execute $timelock (
  exec $token transfer(address,uint256) $grantee 100e18
  access-control:grant $token MINTER_ROLE $grantee
)
```

## Notes

- The block, `--predecessor` and `--salt` must match the original
  [governor:timelock-schedule](timelock-schedule.md) exactly.
- Requires the EXECUTOR_ROLE (or none, when the role is granted to the zero
  address). Any ETH the actions spend is forwarded automatically.

## See Also

- [@governor.timelockOperationState](../helpers/governor.timelockOperationState.md) — wait for Ready
