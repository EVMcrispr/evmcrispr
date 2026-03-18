---
title: "aragonos:upgrade"
---

Upgrade an installed Aragon app to a new version.

## Syntax

```evml
aragonos:upgrade <apmRepo> [newAppAddress]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `apmRepo` | `repo` |  |
| `[newAppAddress]` | `any` | Specific implementation address |

## Examples

```evml
# Upgrade to latest version
aragonos:connect 0x8ccbeab14b5ac4a431fffc39f4bec4089020a155 (
  upgrade disputable-conviction-voting.open
)
```

<!-- HAND-WRITTEN -->

## See Also

- [install](install.md) — install new apps
- [connect](connect.md) — connect to a DAO
