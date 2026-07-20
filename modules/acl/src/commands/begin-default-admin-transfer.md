---
title: "acl:begin-default-admin-transfer"
---

Start the delayed two-step transfer of the DEFAULT_ADMIN_ROLE on an AccessControlDefaultAdminRules contract.

## Syntax

```evml
acl:begin-default-admin-transfer <contract> <newAdmin>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `contract` | `address` | AccessControlDefaultAdminRules contract address |
| `newAdmin` | `address` | New default admin |

<!-- HAND-WRITTEN -->

## Examples

```evml
load acl

set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb
acl:begin-default-admin-transfer $token 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
```

## Notes

- Only the current default admin can start the transfer; the new admin can
  accept once the delay (see
  [@acl:defaultAdminDelay](../helpers/defaultAdminDelay.md)) has passed.
- Starting a new transfer overwrites a pending one.

## See Also

- [acl:accept-default-admin-transfer](accept-default-admin-transfer.md)
- [acl:cancel-default-admin-transfer](cancel-default-admin-transfer.md)
