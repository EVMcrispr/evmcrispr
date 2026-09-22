---
title: "governor:vote"
---

Cast a vote on an active Governor proposal.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
governor:vote <governor> <proposalId> <support>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `governor` | `address` | Build time | Governor address |
| `proposalId` | `number` | Runtime in smart blocks | Proposal id |
| `support` | `voteSupport` | Build time | for, against or abstain |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--reason` | `string` | Runtime in smart blocks | Reason for the vote, stored on-chain |

<!-- HAND-WRITTEN -->

## Examples

```evml
load governor

set $governor 0x44fA8E6f47987339850636F88629646662444217
set $proposalId 42

governor:vote $governor $proposalId for
governor:vote $governor $proposalId against --reason "Treasury impact is too high"
governor:vote $governor $proposalId abstain
```

## Notes

- Support values follow the Governor convention: 0 = against, 1 = for,
  2 = abstain; the raw numbers are accepted too.
- With `--reason` the vote is cast via
  `castVoteWithReason` and the reason is stored in the event log.

## See Also

- [governor:propose](propose.md) — create the proposal
- [governor:delegate](delegate.md) — delegate voting power first
