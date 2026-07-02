---
title: "ens:register"
---

Register a .eth name via the controller's commit/reveal flow (commits, waits and reveals in one go by default).

## Syntax

```evml
ens:register <name> <owner> <duration>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | .eth name or label (e.g. mydao.eth or mydao) |
| `owner` | `address` | Owner of the name |
| `duration` | `number` | Registration duration in seconds |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--secret` | `bytes32` | Commitment secret; must be identical across the commit and reveal steps |
| `--resolver` | `address` | Resolver to set at registration (defaults to the chain's Public Resolver) |
| `--reverse-record` | `bool` | Also set the owner's primary ENS name |
| `--step` | `string` | Which part of the flow to run: commit-wait-reveal (default), only-commit, only-reveal, only-commit-and-wait, only-wait-and-reveal |

<!-- HAND-WRITTEN -->

## Examples

```evml
load ens

# Commit, wait ~60s and reveal in one script (default)
ens:register mydao @me 31536000 --secret @id("my registration secret") --resolver 0xF29100983E058B709F3D539b0c765937B804AC15 --reverse-record true

# Split the flow across two scripts (e.g. two DAO votes)
ens:register mydao @me 31536000 --secret @id("my registration secret") --step only-commit
ens:register mydao @me 31536000 --secret @id("my registration secret") --step only-reveal
```

## Notes

- Registration is a commit/reveal flow. By default the command emits the
  commit transaction, a real-time wait for the controller's minimum
  commitment age (plus a small margin), and the reveal transaction. In fork
  simulations the wait is instant — the fork's clock is warped instead.
- `--step` selects which part runs: `commit-wait-reveal` (default),
  `only-commit`, `only-reveal`, `only-commit-and-wait`,
  `only-wait-and-reveal`. All steps must use identical arguments and
  `--secret`, otherwise the reveal won't find the commitment.
- The reveal sends the rent price plus a 2% buffer; the controller refunds
  any excess.
- `--reverse-record` also sets the owner's primary ENS name.

## See Also

- [@ens.rentPrice](../helpers/ens.rentPrice.md) — price a registration
- [@ens.available](../helpers/ens.available.md) — check availability first
