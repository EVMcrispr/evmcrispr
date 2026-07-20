---
title: "acl:set-target-function-role"
---

Map functions of a managed contract to the AccessManager role required to call them.

## Syntax

```evml
acl:set-target-function-role <manager> <target> <roleId> <signatures>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `manager` | `address` | AccessManager address |
| `target` | `address` | Managed contract address |
| `roleId` | `number \| string` | Role id required to call the functions (or ADMIN_ROLE / PUBLIC_ROLE) |
| `signatures` | `array` | Function signatures to gate |

<!-- HAND-WRITTEN -->

## Examples

```evml
load acl

set $manager 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1
set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb

# Require role 42 to mint or burn on the managed token
acl:set-target-function-role $manager $token 42 ["mint(address,uint256)" "burn(uint256)"]

# Open a function to everyone
acl:set-target-function-role $manager $token PUBLIC_ROLE ["pause()"]
```

## Notes

- Signatures are converted to 4-byte selectors before calling
  `setTargetFunctionRole(address,bytes4[],uint64)`.
- The target contract must be `AccessManaged` and point at this
  AccessManager for the restriction to take effect.

## See Also

- [acl:set-target-closed](set-target-closed.md) — block a target entirely
- [@acl:canCall](../helpers/canCall.md) — check the resulting permissions
