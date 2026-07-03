---
title: "access-control:rollback-default-admin-delay"
---

Cancel a scheduled default admin delay change.

## Syntax

```evml
access-control:rollback-default-admin-delay <contract>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `contract` | `address` | AccessControlDefaultAdminRules contract address |

<!-- HAND-WRITTEN -->

## Examples

```evml
load access-control

access-control:rollback-default-admin-delay $token
```

## See Also

- [access-control:change-default-admin-delay](change-default-admin-delay.md)
