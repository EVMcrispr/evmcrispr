---
title: "aragonos:install"
---

Install an Aragon app into the connected DAO.

Smart blocks: build-time inputs only. Package lookup, initializer ABI selection and predicted address bindings are build-time operations.

## Syntax

```evml
aragonos:install <variable> <identifier> [...params]
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `variable` | `variable` | Build time | Variable name |
| `identifier` | `repo` | Build time | App APM repository name |
| `[...params]` | `any` | Build time | App initialization arguments |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--version` | `string` | Build time | Specific app version to install |

## Examples

```evml
# Install a token-manager app
aragonos:connect 0x1fc7e8d8e4bbbef77a4d035aec189373b52125a8 (
  aragonos:install $tm token-manager @aragonos:app(agent) false 1000e18
)
```

<!-- HAND-WRITTEN -->

## See Also

- [upgrade](upgrade.md) — upgrade an installed app
- [connect](connect.md) — establish DAO context first
