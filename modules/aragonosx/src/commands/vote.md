---
title: "aragonosx:vote"
---

Vote on a token-voting proposal.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
aragonosx:vote <plugin> <proposalId> <option>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `plugin` | `plugin` | Voting plugin holding the proposal |
| `proposalId` | `number` | Proposal id |
| `option` | `string` | yes, no or abstain |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--try-early-execution` | `bool` | Execute in the same call if the proposal already passes |

## Examples

```evml
# Vote yes on an open token-voting proposal
aragonosx:connect 0x2222222222222222222222222222222222222222 (
  aragonosx:vote token-voting 3 yes
)
```

<!-- HAND-WRITTEN -->

## See Also
