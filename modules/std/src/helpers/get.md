---
title: "@get"
---

Call a read-only contract function and return its result.

**Returns**: `any`

## Syntax

```evml
@get(address abi ...params)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `address` | `address` | Contract or account address |
| `abi` | `read-abi` | Signature with return types (e.g. `"balanceOf(address)(uint256)"`) |
| `[...params]` | `any` | Function arguments |

## Examples

```evml
# Read a token name
set $name @get(0x44fA8E6f47987339850636F88629646662444217 "name()(string)")

# Read a balance
set $balance @get(@token(DAI) "balanceOf(address)(uint256)" @me)

# Read with indexed parameter
set $info @get(0xdDCbf776dF3dE60163066A5ddDF2277cB445E0F3 "poolInfo(uint256)(uint128,uint64,uint64)" 1)
```

<!-- HAND-WRITTEN -->

## Notes

- The ABI signature must include the return type(s) after the input types
- Format: `"functionName(paramTypes)(returnTypes)"`

## See Also

- [exec](../../commands/exec.md) — write (state-changing) contract calls
- [@token.balance](../token.balance.md) — shortcut for ERC-20 balance queries
