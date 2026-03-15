# @get

Call a read-only contract function and return its result.

**Returns**: `any`

## Syntax

```
@get(address, abi, ...params)
```

## Arguments

| Name | Type | Required |
|------|------|----------|
| address | `address` | Yes |
| abi | `read-abi` | Yes |
| ...params | `any` | No |

<!-- HAND-WRITTEN -->









## Examples

```
# Read a token name
set $name @get(0x6B17...1d0F "name()(string)")

# Read a balance
set $balance @get(@token(DAI) "balanceOf(address)(uint256)" @me)

# Read with multiple return values
set $reserves @get(0xPair... "getReserves()(uint112,uint112,uint32)")

# Read with indexed parameter
set $info @get(0xFarm... "poolInfo(uint256)(uint128,uint64,uint64)" 1)
```

## Notes

- The ABI signature must include the return type(s) after the input types
- Format: `"functionName(paramTypes)(returnTypes)"`

## See Also

- [exec](../../commands/exec.md) — write (state-changing) contract calls
- [@token.balance](../token.balance.md) — shortcut for ERC-20 balance queries
