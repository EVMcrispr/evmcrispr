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

set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb
access-control:rollback-default-admin-delay $token
```

## See Also

- [access-control:change-default-admin-delay](change-default-admin-delay.md)
