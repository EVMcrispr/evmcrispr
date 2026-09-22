---
title: "aragonosx:vote"
---

Vote on a token-voting proposal.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
aragonosx:vote <plugin> <proposalId> <option>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `plugin` | `plugin` | Build time | Voting plugin holding the proposal |
| `proposalId` | `number` | Runtime in smart blocks | Proposal id |
| `option` | `string` | Build time | yes, no or abstain |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--try-early-execution` | `bool` | Runtime in smart blocks | Execute in the same call if the proposal already passes |

## Examples

```evml
# Vote yes on an open token-voting proposal
aragonosx:connect 0x2222222222222222222222222222222222222222 (
  aragonosx:vote token-voting 3 yes
)
```

<!-- HAND-WRITTEN -->

## See Also
