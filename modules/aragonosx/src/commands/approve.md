---
title: "aragonosx:approve"
---

Approve a multisig proposal.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
aragonosx:approve <plugin> <proposalId>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `plugin` | `plugin` | Build time | Multisig plugin holding the proposal |
| `proposalId` | `number` | Runtime in smart blocks | Proposal id |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--try-execution` | `bool` | Runtime in smart blocks | Execute in the same call if the proposal already passes |

## Examples

```evml
# Approve a pending multisig proposal and execute it if it passes
aragonosx:connect 0x2222222222222222222222222222222222222222 (
  aragonosx:approve multisig 5 --try-execution true
)
```

<!-- HAND-WRITTEN -->

## See Also
