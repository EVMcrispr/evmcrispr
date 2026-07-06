---
title: "governor:cancel"
---

Cancel a pending Governor proposal (only its proposer, before voting starts). Takes the same description and action block used in governor:propose.

## Syntax

```evml
governor:cancel <governor> <description> <actions>
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
load access-control

set $governor 0x44fA8E6f47987339850636F88629646662444217
set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb

governor:cancel $governor "Fund the grants program" (
  exec $token transfer(address,uint256) 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 100e18
  access-control:grant $token MINTER_ROLE 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
)
```

## Notes

- By default only the proposer can cancel, and only while the proposal is
  still Pending (before the vote starts).
- The description and block must match the original
  [governor:propose](propose.md) exactly.

## See Also

- [governor:propose](propose.md) — create the proposal
