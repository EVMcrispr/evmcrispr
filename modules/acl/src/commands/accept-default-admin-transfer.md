---
title: "acl:accept-default-admin-transfer"
---

Accept a pending default admin transfer after its schedule has passed. Must be sent by the pending admin.

## Syntax

```evml
acl:accept-default-admin-transfer <contract>
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
acl:accept-default-admin-transfer $token
```

## Notes

- Must be sent by the pending default admin after the accept schedule has
  passed; it revokes the role from the previous admin in the same
  transaction.

## See Also

- [acl:begin-default-admin-transfer](begin-default-admin-transfer.md)
- [@acl:pendingDefaultAdmin](../helpers/pendingDefaultAdmin.md)
