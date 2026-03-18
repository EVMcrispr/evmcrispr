---
title: "aragonos:connect"
---

Connect to an Aragon DAO and execute commands within its context.

## Syntax

```evml
aragonos:connect <daoName> <block>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `daoName` | `dao` |  |
| `block` | `block` | Commands to execute in DAO context |

## Examples

```evml
# Connect to a DAO and grant a permission
aragonos:connect 0x1fc7e8d8e4bbbef77a4d035aec189373b52125a8 (
  grant @me @app(agent) TRANSFER_ROLE
)
```

<!-- HAND-WRITTEN -->

## Notes

- Inside a `connect` block, commands like `grant`, `install`, `revoke` can be used without the `aragonos:` prefix
- The `@app()` helper resolves app identifiers within the connected DAO context
- Nested `connect` blocks allow cross-DAO operations

## See Also

- [grant](grant.md) — manage permissions
- [install](install.md) — install apps
- [@app](../helpers/app.md) — resolve app addresses
