---
title: "aragonos:new-dao"
---

Create a new Aragon DAO and register it with an ENS name.

Smart blocks: build-time inputs only. DAO name registration and deterministic configuration are prepared at build time.

## Syntax

```evml
aragonos:new-dao <variable> <daoName>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `variable` | `variable` | Build time | Variable name |
| `daoName` | `string` | Build time | ENS name for the DAO |

## Examples

```evml
# Create a new DAO
aragonos:new-dao $dao "my-dao"
```

<!-- HAND-WRITTEN -->

## See Also

- [connect](connect.md) — connect to a DAO
- [install](install.md) — install apps in a DAO
