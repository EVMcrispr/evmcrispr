---
title: "governor:execute"
---

Execute a succeeded (and queued, if the Governor uses a timelock) proposal. Takes the same description and action block used in governor:propose.

## Syntax

```evml
governor:execute <governor> <description> <actions>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `governor` | `address` | Governor address |
| `description` | `string` | Proposal description used when proposing |
| `actions` | `block` | Block of commands making up the proposal |

<!-- HAND-WRITTEN -->

## Examples

```evml
load governor
load acl

set $governor 0x44fA8E6f47987339850636F88629646662444217
set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb

governor:execute $governor "Fund the grants program" (
  exec $token transfer(address,uint256) 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 100e18
  acl:grant MINTER_ROLE on $token to 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
)
```

## Notes

- The description and block must match the original
  [governor:propose](propose.md) exactly.
- `execute` is payable: any ETH the proposal actions spend is forwarded
  automatically as the transaction value.

## See Also

- [governor:queue](queue.md) — queue first on timelocked Governors
- [@governor:proposalState](../helpers/proposalState.md) — confirm it Succeeded/Queued
