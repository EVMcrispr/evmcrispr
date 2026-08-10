---
title: "@acl:hasRole"
---

Whether an account holds a role on an AccessControl contract (string roles) or an AccessManager (numeric role ids).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `bool`

## Syntax

```evml
@acl:hasRole(target role account)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `target` | `address` | AccessControl contract or AccessManager address |
| `role` | `number \| string` | Role name (e.g. MINTER_ROLE), bytes32 value, or AccessManager role id |
| `account` | `address` | Account to check |

<!-- HAND-WRITTEN -->

## Examples

```evml
load acl

set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb
set $manager 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1

# AccessControl role names are hashed automatically
print @acl:hasRole($token MINTER_ROLE @me)

# AccessManager numeric role ids
print @acl:hasRole($manager 42 @me)
```

## Notes

- Role resolution follows [acl:grant](../commands/grant.md). For
  AccessManager roles the membership flag is returned; the member's
  execution delay is ignored.

## See Also

- [acl:grant](../commands/grant.md) / [acl:revoke](../commands/revoke.md)

## On-chain face (@hasRole!)

Read role membership at assertion time. Role names still resolve at
composition time (AccessControl names hash to bytes32, numeric ids pick
the AccessManager overload, whose (isMember, delay) pair is unwrapped
through a core pick).

### Examples

```evml
load assertions
load acl

set $token 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2

assertions:assert @hasRole!($token MINTER_ROLE @me) "minter role revoked"
```
