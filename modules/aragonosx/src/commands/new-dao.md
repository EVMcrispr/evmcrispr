---
title: "aragonosx:new-dao"
---

Create a new Aragon OSx DAO with an initial governance plugin.

## Syntax

```evml
aragonosx:new-dao <variable> <plugin> [...params]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `variable` | `variable` | Variable name |
| `plugin` | `repo` | Governance plugin repo (e.g. admin, token-voting) |
| `[...params]` | `any` | Plugin setup parameters |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--subdomain` | `string` | ENS subdomain to register (e.g. `mydao` for mydao.dao.eth) |
| `--dao-uri` | `string` | DAO URI (EIP-4824) |
| `--metadata` | `string` | DAO metadata (conventionally an IPFS URI) |
| `--version` | `string` | Plugin version as <release>.<build> (default latest) |

<!-- HAND-WRITTEN -->

## Examples

```evml
# Create a DAO controlled by a single admin account
aragonosx:new-dao $dao admin @me [0x0000000000000000000000000000000000000000 0]
aragonosx:connect $dao (
  aragonosx:propose admin (
    aragonosx:grant ROOT on dao to @me
  )
)
```

## Notes

- The plugin setup parameters follow the same encoding as `install` (here: the admin address and a `(target, operation)` target config, where the zero address targets the DAO itself).
- `$variable` is bound to the predicted DAO address, and the DAO is pre-cached so a `connect $variable` later in the same script works before any indexer has seen it.
