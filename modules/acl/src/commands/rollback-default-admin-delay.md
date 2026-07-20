---
title: "acl:rollback-default-admin-delay"
---

Cancel a scheduled default admin delay change.

## Syntax

```evml
acl:rollback-default-admin-delay <contract>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `contract` | `address` | AccessControlDefaultAdminRules contract address |

<!-- HAND-WRITTEN -->

## Examples

```evml
load acl

set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb
acl:rollback-default-admin-delay $token
```

## See Also

- [acl:change-default-admin-delay](change-default-admin-delay.md)
