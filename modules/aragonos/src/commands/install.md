---
title: "aragonos:install"
---

Install an Aragon app into the connected DAO.

## Syntax

```evml
aragonos:install <variable> <identifier> [...params]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `variable` | `variable` | Variable name |
| `identifier` | `repo` | App APM repository name |
| `[...params]` | `any` | App initialization arguments |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--dao` | `any` | DAO address or name to install into |
| `--version` | `any` | Specific app version to install |

## Examples

```evml
# Install a token-manager app
aragonos:connect 0x1fc7e8d8e4bbbef77a4d035aec189373b52125a8 (
  aragonos:install $tm token-manager:new-app @aragonos:app(agent) false 1000e18
)
```

<!-- HAND-WRITTEN -->

## See Also

- [upgrade](upgrade.md) — upgrade an installed app
- [connect](connect.md) — establish DAO context first
