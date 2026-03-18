---
title: "batch"
---

Group multiple commands into a single transaction.

## Syntax

```evml
batch <block>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `block` | `block` | Block of commands |

## Examples

```evml
# Batch approve + transfer into one transaction
batch (
  exec @token(DAI) "approve(address,uint256)" 0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6 1000e18
  exec @token(DAI) "transfer(address,uint256)" 0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6 1000e18
)
```

<!-- HAND-WRITTEN -->

## Notes

- All commands in the batch are combined into a single multicall transaction
- If any command in the batch reverts, the entire batch reverts
- Event captures on a batch apply to the combined transaction receipt

## See Also

- [exec](exec.md) — individual contract calls
