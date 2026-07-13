---
title: "aragonosx:approve"
---

Approve a multisig proposal.

## Syntax

```evml
aragonosx:approve <plugin> <proposalId>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `plugin` | `plugin` | Multisig plugin holding the proposal |
| `proposalId` | `number` | Proposal id |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--try-execution` | `bool` | Execute in the same call if the proposal already passes |

## Examples

```evml
# Approve a pending multisig proposal and execute it if it passes
aragonosx:connect 0x2222222222222222222222222222222222222222 (
  aragonosx:approve multisig 5 --try-execution true
)
```

<!-- HAND-WRITTEN -->

## See Also
