---
title: "acl:rollback-default-admin-delay"
---

Cancel a scheduled default admin delay change.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
acl:rollback-default-admin-delay <contract>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `contract` | `address` | Runtime in smart blocks | AccessControlDefaultAdminRules contract address |

<!-- HAND-WRITTEN -->

## Examples

```evml
load acl

set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb
acl:rollback-default-admin-delay $token
```

## See Also

- [acl:change-default-admin-delay](change-default-admin-delay.md)
