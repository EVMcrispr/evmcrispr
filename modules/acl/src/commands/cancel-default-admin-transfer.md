---
title: "acl:cancel-default-admin-transfer"
---

Cancel a pending default admin transfer. Must be sent by the current default admin.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
acl:cancel-default-admin-transfer <contract>
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
acl:cancel-default-admin-transfer $token
```

## See Also

- [acl:begin-default-admin-transfer](begin-default-admin-transfer.md)
