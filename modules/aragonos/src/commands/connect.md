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
| `daoName` | `dao` | DAO kernel address or Aragonid ENS name |
| `block` | `block` | Commands to execute in DAO context |

## Examples

```evml
# Connect to a DAO and grant a permission
aragonos:connect 0x1fc7e8d8e4bbbef77a4d035aec189373b52125a8 (
  aragonos:grant @me @aragonos:app(agent) TRANSFER_ROLE
)
```

<!-- HAND-WRITTEN -->

## Notes

- Inside a `connect` block, aragonos commands must be qualified (`aragonos:grant`) or imported through the load import list (`load aragonos [connect grant @app]`) to be used unqualified
- The `@aragonos:app()` helper resolves app names within the connected DAO context
- `connect` blocks cannot be nested. For cross-DAO operations, use sequential top-level `connect` blocks and share values through variables: `set` bindings persist after the block ends

## See Also

- [grant](grant.md) — manage permissions
- [install](install.md) — install apps
- [@app](../helpers/app.md) — resolve app addresses
