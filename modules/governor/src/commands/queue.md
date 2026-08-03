---
title: "governor:queue"
---

Queue a succeeded Governor proposal into its timelock. Takes the same description and action block used in governor:propose.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
governor:queue <governor> <description> <actions>
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

governor:queue $governor "Fund the grants program" (
  exec $token transfer(address,uint256) 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 100e18
  acl:grant MINTER_ROLE on $token to 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
)
```

## Notes

- Only needed on Governors wired to a timelock; check with the Governor's
  `proposalNeedsQueuing`.
- The description and block must match the original
  [governor:propose](propose.md) exactly — the on-chain call takes the keccak256
  hash of the description, not the text.

## See Also

- [governor:execute](execute.md) — execute after the timelock delay
