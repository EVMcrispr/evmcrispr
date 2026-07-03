---
title: "@access-control:access-control.canCall"
---

Whether a caller can immediately call a restricted function of a contract managed by an AccessManager.

**Returns**: `bool`

## Syntax

```evml
@access-control:access-control.canCall(manager, caller, target, signature)
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
load access-control

print @access-control.canCall($manager @me $token "mint(address,uint256)")
```

## Notes

- Returns `true` only when the caller can execute the function
  immediately; a member whose grant carries an execution delay gets
  `false` (the call must go through the AccessManager schedule flow).

## See Also

- [access-control:set-target-function-role](../commands/set-target-function-role.md)
