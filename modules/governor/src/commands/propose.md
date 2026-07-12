---
title: "governor:propose"
---

Create a Governor proposal from a block of commands: each action in the block becomes one of the proposal calls. Optionally binds the proposal id to a variable.

## Syntax

```evml
governor:propose [variable] <governor> <description> <actions>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[variable]` | `variable` | Variable to bind the proposal id to |
| `governor` | `address` | Governor address |
| `description` | `string` | Proposal description (markdown) |
| `actions` | `block` | Block of commands making up the proposal |

<!-- HAND-WRITTEN -->

## Examples

```evml
load governor
load access-control

set $governor 0x323A76393544d5ecca80cd6ef2A560C6a395b7E3
set $token 0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72

# Bind the proposal id for voting later in the same script
governor:propose $proposalId $governor "Fund the grants program" (
  exec $token transfer(address,uint256) 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 100e18
  access-control:grant $token MINTER_ROLE 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
)
```

## Notes

- Every transaction action produced by the block becomes one `(target,
  value, calldata)` entry of the proposal, in order.
- The sender needs voting power above the Governor's `proposalThreshold` at
  the previous block.
- The optional leading variable is bound to the proposal id (via
  `getProposalId`/`hashProposal`, with a local fallback), ready for
  [governor:vote](vote.md) or [@governor:proposalState](../helpers/proposalState.md).
- Keep the description: `governor:queue`, `governor:execute` and `governor:cancel` need the
  exact same description and action block to derive the proposal id.

## See Also

- [governor:vote](vote.md) — vote on the proposal
- [governor:queue](queue.md) / [governor:execute](execute.md) — run a passed proposal
- [@governor:proposalState](../helpers/proposalState.md) — track its lifecycle
