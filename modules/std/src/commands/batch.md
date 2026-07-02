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

## Error Captures on Batches

Error captures on a batch catch the combined transaction revert:

```evml
batch (
  exec $token "transfer(address,uint256)" @me 100e18
) -!> Error(string) [$reason]

# Assertion only, boolean variable, and optional forms all work
batch (...) -!> Unauthorized()
batch (...) -?!> Unauthorized() $reverted
```

## Notes

- All commands in the batch are combined into a single atomic transaction
  (EIP-5792 `wallet_sendCalls` for EOAs, batched Safe transaction for Safes)
- If any command in the batch reverts, the entire batch reverts
- Event captures (`->`) on a batch apply to the combined transaction receipt
- Error captures (`-!>` / `-?!>`) on a batch catch the combined transaction revert
- Inside a `sim:fork` block, the batch is simulated as an EIP-7702 transaction:
  a delegation to MetaMask's EIP7702StatelessDeleGator is installed on the
  sender EOA (if not already delegated) and the calls execute atomically
  through it — mirroring how wallets fulfill `wallet_sendCalls`

## See Also

- [exec](exec.md) — individual contract calls
