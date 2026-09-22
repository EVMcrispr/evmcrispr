---
title: "aragonos:upgrade"
---

Upgrade an installed Aragon app to a new version.

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
aragonos:upgrade <apmRepo> [newAppAddress]
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `apmRepo` | `repo` | Build time | APM repository name for the app package |
| `[newAppAddress]` | `address \| string` | Runtime in smart blocks | Implementation address or semantic version (e.g. 1.2.0) |

## Examples

```evml
# Upgrade to latest version
aragonos:connect 0x8ccbeab14b5ac4a431fffc39f4bec4089020a155 (
  aragonos:upgrade disputable-conviction-voting.open
)
```

<!-- HAND-WRITTEN -->

## See Also

- [install](install.md) — install new apps
- [connect](connect.md) — connect to a DAO
