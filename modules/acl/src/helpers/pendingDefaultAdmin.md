---
title: "@acl:pendingDefaultAdmin"
---

Pending default admin of an AccessControlDefaultAdminRules contract (the zero address when no transfer is in progress).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `address`

## Syntax

```evml
@acl:pendingDefaultAdmin(contract)
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
print @acl:pendingDefaultAdmin($token)
```

## Notes

- Returns the zero address when no transfer is in progress.

## See Also

- [acl:accept-default-admin-transfer](../commands/accept-default-admin-transfer.md)
