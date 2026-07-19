---
title: "@aragonos:nextApp"
---

Predict the address of the next app to be installed in the DAO.

**Returns**: `address`

## Syntax

```evml
@aragonos:nextApp(offset?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[offset]` | `number` | Nonce offset from next install |

## Examples

```evml
# Predict the next app address
aragonos:connect 0x1fc7e8d8e4bbbef77a4d035aec189373b52125a8 (
  set $next @aragonos:nextApp
  print $next
)
```

<!-- HAND-WRITTEN -->

## See Also

- [install](../commands/install.md) — install apps in a DAO
- [@app](app.md) — resolve existing app addresses
