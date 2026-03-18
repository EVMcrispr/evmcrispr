---
title: "aragonos:new-dao"
---

Create a new Aragon DAO and register it with an ENS name.

## Syntax

```evml
aragonos:new-dao <variable> <daoName>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `variable` | `variable` | Variable name |
| `daoName` | `string` | ENS name for the DAO |

## Examples

```evml
# Create a new DAO
aragonos:new-dao $dao "my-dao"
```

<!-- HAND-WRITTEN -->

## See Also

- [connect](connect.md) — connect to a DAO
- [install](install.md) — install apps in a DAO
