---
title: "@acl:pendingDefaultAdmin"
---

Pending default admin of an AccessControlDefaultAdminRules contract (the zero address when no transfer is in progress).

**On-chain (`@acl:pendingDefaultAdmin!`)**: Reads the pending admin of the pair, not the accept schedule.

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

## On-chain face (@pendingDefaultAdmin!)

Read the pending default admin at assertion time. The contract returns
(newAdmin, acceptSchedule); the face unwraps the admin word through a
core pick.

### Examples

```evml
load acl

set $registry 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2

assert @pendingDefaultAdmin!($registry) == 0x0000000000000000000000000000000000000000 "transfer pending"
```
