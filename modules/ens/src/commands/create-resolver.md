---
title: "ens:create-resolver"
---

Deploy an ENSv2 resolver (PermissionedResolver) through ENS's VerifiableFactory and bind its predicted address to <variable>. Its admin (the sender by default) gets every role, so it can set records of any name that uses it.

Smart blocks: build-time inputs only. The resolver's address is predicted from its salt and deployer when the script is built.

## Syntax

```evml
ens:create-resolver <variable>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `variable` | `variable` | Build time | Variable to bind the new resolver's address to |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--admin` | `address` | Build time | Account given every role on the resolver (default: the transaction sender) |
| `--salt` | `bytes32` | Build time | Salt of the resolver's address, with the sender (default: random) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load ens

# A resolver of your own, then a name that uses it
ens:create-resolver $resolver
ens:set-resolver mydao.eth $resolver
ens:set-text mydao.eth url "https://mydao.example"

# Or register a name with it from the start
ens:create-resolver $resolver --salt @hash("mydao resolver")
ens:register mydao @me 1y --secret @hash("my registration secret") --resolver $resolver
```

## Notes

- ENSv2 names keep their records in a resolver of their owner's, an ENSv2
  PermissionedResolver deployed through ENS's VerifiableFactory. One resolver
  can serve many names.
- The admin (the sender by default) gets every role on it, as the ENS app
  grants: it can set any record of any name that uses the resolver, and
  grant those roles to others.
- The address follows from the sender and the salt, so it is known before
  the deployment: a script can use `$resolver` right after this line. The
  salt is random unless `--salt` gives one; reusing a sender and salt fails.

## See Also

- [ens:set-resolver](set-resolver.md) — point a name at it
- [ens:set-text](set-text.md), [ens:set-addr](set-addr.md),
  [ens:set-contenthash](set-contenthash.md) — set its records
