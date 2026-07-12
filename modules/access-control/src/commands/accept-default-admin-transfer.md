---
title: "access-control:accept-default-admin-transfer"
---

Accept a pending default admin transfer after its schedule has passed. Must be sent by the pending admin.

## Syntax

```evml
access-control:accept-default-admin-transfer <contract>
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
access-control:accept-default-admin-transfer $token
```

## Notes

- Must be sent by the pending default admin after the accept schedule has
  passed; it revokes the role from the previous admin in the same
  transaction.

## See Also

- [access-control:begin-default-admin-transfer](begin-default-admin-transfer.md)
- [@access-control:pendingDefaultAdmin](../helpers/pendingDefaultAdmin.md)
