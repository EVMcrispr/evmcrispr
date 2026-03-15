# exec

Call a contract function, encoding the arguments from its signature.

## Syntax

```
exec <contractAddress> <signature> [...params]
```

## Arguments

| Name | Type | Required |
|------|------|----------|
| contractAddress | `address` | Yes |
| signature | `write-abi` | Yes |
| ...params | `any` | No |

## Options

| Name | Type |
|------|------|
| --value | `number` |
| --from | `address` |
| --gas | `number` |
| --max-fee-per-gas | `number` |
| --max-priority-fee-per-gas | `number` |
| --nonce | `number` |

<!-- HAND-WRITTEN -->









## Examples

```
# Approve a token
exec @token(DAI) "approve(address,uint256)" 0x64c0...a84e 1200e18

# Send ETH with the call
exec 0xWETH... "deposit()" --value 1e18

# Specify sender
exec @token(DAI) "approve(address,uint256)" 0x64c0...a84e 1200e18 --from 0x44fA...4217

# Capture events from the transaction
exec $wxdai "deposit()" --value 0.001e18 -> Deposit(address indexed, uint) [_ $amount]
exec $wxdai "withdraw(uint)" $amount

# Complex parameter types
exec 0xTarget... "deposit((uint256,int256),uint256[][])" [1 -2] [[2 3] [4 5]]
```

## Notes

- The signature follows Solidity syntax: `"functionName(type1,type2)"`
- Parameters are automatically ABI-encoded based on the signature
- Use `--value` to send ETH with the call
- Use `--from` to impersonate a sender (requires simulation mode)
- Event captures (`->`) execute the transaction immediately and store decoded log values in variables

## See Also

- [@get](../helpers/get.md) — read-only contract calls
- [batch](batch.md) — group multiple exec calls into one transaction
- [raw](raw.md) — send pre-encoded calldata
