---
title: "@aragonos:app"
---

Resolve an app identifier to its proxy address within the connected DAO.

**Returns**: `address`

## Syntax

```evml
@aragonos:app(appIdentifier)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `appIdentifier` | `string` | App name, or `dao:app` for cross-DAO lookup |

## Examples

```evml
# Resolve app address within a DAO
aragonos:connect 0x1fc7e8d8e4bbbef77a4d035aec189373b52125a8 (
  set $agent @aragonos:app(agent)
  print $agent
)
```

<!-- HAND-WRITTEN -->

## See Also

- [connect](../../commands/connect.md) — connect to a DAO
- [@nextApp](nextApp.md) — predict next app address
