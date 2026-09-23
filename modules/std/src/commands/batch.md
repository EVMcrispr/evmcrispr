---
title: "batch"
---

Group multiple commands into a single transaction.

Smart blocks: cannot be nested. This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.

## Syntax

```evml
batch <block>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `block` | `block` | Build time | Block of commands |

## Examples

```evml
# Batch approve + transfer into one transaction
batch (
  exec @token(DAI) "approve(address,uint256)" 0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6 1000e18
  exec @token(DAI) "transfer(address,uint256)" 0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6 1000e18
)
```

<!-- HAND-WRITTEN -->

## Revert Captures on Batches

Revert captures on a batch catch the combined transaction revert. They belong on the batch command: the transaction is sent after the block is composed, so `-!>` / `-?!>` inside the block are refused. A line inside the block captures its own build-time refusal with `-/>` / `-?/>`.

```evml
set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb

batch (
  exec $token "transfer(address,uint256)" @me 100e18
) -!> Error(string) [$reason]

# Assertion only: assert the batch reverts with a specific error
batch (
  exec $token "transfer(address,uint256)" @me 100e18
) -!> Unauthorized()

# Optional form with a boolean variable ($reverted = "true"/"false")
batch (
  exec $token "transfer(address,uint256)" @me 100e18
) -?!> Unauthorized() $reverted
```

## Notes

- All commands in the batch are combined into a single atomic transaction
  (EIP-5792 `wallet_sendCalls` for EOAs, batched Safe transaction for Safes)
- If any command in the batch reverts, the entire batch reverts
- Event captures (`->`) on a batch apply to the combined transaction receipt
- Revert captures (`-!>` / `-?!>`) on a batch catch the combined transaction revert
- Inside a `sim:fork` block, the batch is simulated as an EIP-7702 transaction:
  a delegation to MetaMask's EIP7702StatelessDeleGator is installed on the
  sender EOA (if not already delegated) and the calls execute atomically
  through it — mirroring how wallets fulfill `wallet_sendCalls`

## See Also

- [exec](exec.md) — individual contract calls
