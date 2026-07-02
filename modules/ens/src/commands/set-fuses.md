---
title: "ens:set-fuses"
---

Burn NameWrapper fuses on a wrapped ENS name.

## Syntax

```evml
ens:set-fuses <name> <fuse> [...moreFuses]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | Wrapped ENS name (e.g. vault.mydao.eth) |
| `fuse` | `fuse` | Fuse name to burn (e.g. cannot-unwrap) |
| `[...moreFuses]` | `fuse` | Additional fuse names to burn |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--expiry` | `number` | New expiry timestamp (parent-controlled fuses only; defaults to the current expiry) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load ens

# Lock a name: it can never be unwrapped again
ens:set-fuses mydao.eth cannot-unwrap

# Burn several owner-controlled fuses at once
ens:set-fuses mydao.eth cannot-unwrap cannot-transfer cannot-set-resolver

# Burn parent-controlled fuses on a subname you parent
ens:set-fuses vault.mydao.eth parent-cannot-control cannot-unwrap
```

## Notes

- Burning fuses is irreversible for the lifetime of the name — nothing is
  burned implicitly; missing prerequisites (like `cannot-unwrap`) produce an
  error telling you what to add.
- Parent-controlled fuses are burned via `setChildFuses`, so the executing
  account must own the parent name.

## See Also

- [@ens.fuses.of](../helpers/ens.fuses.of.md) — read burned fuses
- [@ens.fuses](../helpers/ens.fuses.md) — build a fuse bitmap
