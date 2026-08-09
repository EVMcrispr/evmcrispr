---
title: "@acl:defaultAdminDelay"
---

Delay in seconds applied to default admin transfers of an AccessControlDefaultAdminRules contract. As @defaultAdminDelay! the read happens on-chain at assertion time.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@acl:defaultAdminDelay(contract)
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
print @acl:defaultAdminDelay($token)
```

## See Also

- [acl:change-default-admin-delay](../commands/change-default-admin-delay.md)

## On-chain face (@defaultAdminDelay!)

Read defaultAdminDelay() at assertion time.

### Examples

```evml
load assertions
load acl

set $registry 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2

assertions:assert @defaultAdminDelay!($registry) >= 3600 "delay lowered"
```
