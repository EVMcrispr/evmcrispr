---
title: "access-control:cancel-default-admin-transfer"
---

Cancel a pending default admin transfer. Must be sent by the current default admin.

## Syntax

```evml
access-control:cancel-default-admin-transfer <contract>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `contract` | `address` | AccessControlDefaultAdminRules contract address |

<!-- HAND-WRITTEN -->

## Examples

```evml
load access-control

access-control:cancel-default-admin-transfer $token
```

## See Also

- [access-control:begin-default-admin-transfer](begin-default-admin-transfer.md)
