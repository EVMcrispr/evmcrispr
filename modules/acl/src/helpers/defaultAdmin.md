---
title: "@acl:defaultAdmin"
---

Current default admin of an AccessControlDefaultAdminRules contract.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `address`

## Syntax

```evml
@acl:defaultAdmin(contract)
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
print @acl:defaultAdmin($token)
```

## See Also

- [acl:begin-default-admin-transfer](../commands/begin-default-admin-transfer.md)

## On-chain face (@defaultAdmin!)

Read defaultAdmin() at assertion time.

### Examples

```evml
load acl

set $registry 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2

assert @defaultAdmin!($registry) == @me
```
