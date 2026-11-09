---
title: "ens:migrate"
---

Move a .eth name from ENS v1 to ENSv2: its owner transfers it to ENSv2's migration controller, which registers it in ENSv2 with the same expiry plus 62 days. Unwrapped and unlocked wrapped names go to the unlocked controller, locked ones (CANNOT_UNWRAP burned) to the locked one.

Smart blocks: build-time inputs only. The name's ENS v1 state decides which controller and token the migration goes through when the script is built.

## Syntax

```evml
ens:migrate <name>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `name` | `string` | Build time | .eth name to migrate (e.g. mydao.eth) |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--owner` | `address` | Build time | Owner of the name on ENSv2 (default: its owner on ENS v1) |
| `--resolver` | `address` | Build time | Resolver of the name on ENSv2 (default: its ENS v1 resolver, so its records still resolve) |
| `--subregistry` | `address` | Build time | Registry of the name's subnames on ENSv2 (default: none; not for locked names, whose controller creates one) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load ens

# Move a name to ENSv2, keeping its owner and resolver
ens:migrate mydao.eth

# Hand it to the DAO's agent on the way, with a resolver of ENSv2
ens:create-resolver $resolver
ens:migrate mydao.eth --owner 0x1234567890abcdef1234567890abcdef12345678 --resolver $resolver
```

## Notes

- Since ENSv2 every ENS v1 .eth name already sits in ENSv2's ETHRegistry as
  reserved for its owner, with its ENS v1 expiry plus 62 days. Migrating it
  registers it there: its owner gets the roles of an ENSv2 name and the
  ENSv2 commands apply to it. A migration cannot be undone.
- The sender must hold the name's token: the registrant of an unwrapped name,
  the NameWrapper holder of a wrapped one (or an account they approved).
- By default the name keeps its owner and its ENS v1 resolver, so its records
  still resolve; that resolver cannot be written to on ENSv2, so to change
  records afterwards point the name at an ENSv2 resolver
  ([ens:create-resolver](create-resolver.md), [ens:set-resolver](set-resolver.md)).
- A locked name (`cannot-unwrap` burned) goes to the locked controller,
  which creates its subregistry and turns its fuses into roles, so
  `--subregistry` does not apply. A name with `cannot-transfer` burned
  cannot be migrated.
- A name in its ENS v1 grace period must be renewed first
  ([ens:renew](renew.md)). Subnames move with their .eth name.

## See Also

- [ens:renew](renew.md) — renew a name before migrating it
- [ens:transfer](transfer.md) — transfer it on ENSv2 afterwards
