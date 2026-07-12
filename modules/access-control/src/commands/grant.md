---
title: "access-control:grant"
---

Grant a role on an AccessControl contract (string roles, hashed with keccak256) or an AccessManager (numeric role ids).

## Syntax

```evml
access-control:grant <target> <role> <account>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `target` | `address` | AccessControl contract or AccessManager address |
| `role` | `number \| string` | Role name (e.g. MINTER_ROLE), bytes32 value, or AccessManager role id |
| `account` | `address` | Account to grant to |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--delay` | `number` | Execution delay in seconds for the grantee (AccessManager role ids only) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load access-control

set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb
set $manager 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1

# AccessControl: role names are hashed with keccak256
access-control:grant $token MINTER_ROLE @me
access-control:grant $token DEFAULT_ADMIN_ROLE 0x4F2083f5fBede34C2714aFfb3105539775f7FE64

# AccessManager: numeric role ids, optionally with an execution delay
access-control:grant $manager 1 @me
access-control:grant $manager 42 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 --delay 86400
```

## Notes

- String roles target AccessControl `grantRole(bytes32,address)`: the name is
  hashed with keccak256 (so `MINTER_ROLE` becomes
  `@id(MINTER_ROLE)`), `DEFAULT_ADMIN_ROLE` maps to `0x00…00`, and a `0x…`
  bytes32 value passes through untouched.
- Numeric roles target AccessManager `grantRole(uint64,address,uint32)`.
  `ADMIN_ROLE` and `PUBLIC_ROLE` are accepted as aliases for `0` and
  `2^64-1`. `--delay` sets the grantee's execution delay in seconds and is
  only valid here.
- The sender must hold the role's admin role.

## See Also

- [access-control:revoke](revoke.md) — remove a role
- [access-control:renounce](renounce.md) — give up one of your own roles
- [@access-control:hasRole](../helpers/hasRole.md) — check membership
- [@access-control:roleAdmin](../helpers/roleAdmin.md) — find the admin role
