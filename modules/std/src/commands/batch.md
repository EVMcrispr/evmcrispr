# batch

Group multiple commands into a single transaction.

## Syntax

```
batch <block>
```

## Arguments

| Name | Type | Required |
|------|------|----------|
| block | `block` | Yes |

<!-- HAND-WRITTEN -->









## Examples

```
# Batch approve + swap into one transaction
batch (
  exec @token(DAI) "approve(address,uint256)" 0xRouter... @token.amount(DAI 1000)
  exec 0xRouter... "swap(address,uint256)" @token(DAI) @token.amount(DAI 1000)
)

# Capture events from the entire batch
batch (
  exec $wxdai "deposit()" --value 0.001e18
  exec $wxdai "withdraw(uint)" 0.001e18
) -> Deposit(address indexed, uint) [_ $amount]
```

## Notes

- All commands in the batch are combined into a single multicall transaction
- If any command in the batch reverts, the entire batch reverts
- Event captures on a batch apply to the combined transaction receipt

## See Also

- [exec](exec.md) — individual contract calls
