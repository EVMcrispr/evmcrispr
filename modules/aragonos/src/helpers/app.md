---
title: "@aragonos:app"
---

Resolve an app name to its proxy address within the connected DAO.

**Returns**: `address`

## Syntax

```evml
@aragonos:app(appName index?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `appName` | `string` | App name (e.g. `vault`, `voting.open`) |
| `[index]` | `number` | Instance index when multiple apps share a name (0 = first) |

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
