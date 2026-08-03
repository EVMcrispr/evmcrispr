---
title: "@acl:canCall"
---

Whether a caller can immediately call a restricted function of a contract managed by an AccessManager.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `bool`

## Syntax

```evml
@acl:canCall(manager caller target signature)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `manager` | `address` | AccessManager address |
| `caller` | `address` | Calling account |
| `target` | `address` | Managed contract address |
| `signature` | `string` | Function signature (e.g. mint(address,uint256)) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load acl

set $manager 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1
set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb

print @acl:canCall($manager @me $token "mint(address,uint256)")
```

## Notes

- Returns `true` only when the caller can execute the function
  immediately; a member whose grant carries an execution delay gets
  `false` (the call must go through the AccessManager schedule flow).

## See Also

- [acl:set-target-function-role](../commands/set-target-function-role.md)
