---
title: Batch Transactions
---

EVMcrispr can bundle multiple operations into a single atomic transaction.
This guide covers how batching works and when to use it.

## Basic Batching

Wrap commands in `batch` to combine them into one transaction:

```evml
batch (
  exec @token(DAI) "approve(address,uint256)" 0xRouter... @token.amount(DAI 1000)
  exec 0xRouter... "swap(address,uint256)" @token(DAI) @token.amount(DAI 1000)
)
```

Both the approve and swap happen atomically — if either fails, both revert.

## When to Use Batch

- **Approve + action**: Approve a token and use it in the same tx
- **Multi-step operations**: Multiple related state changes that should be atomic
- **Gas efficiency**: Save gas by avoiding multiple transaction submissions
- **Safety**: Ensure all-or-nothing execution of related operations

## Event Captures on Batches

You can capture events emitted during the entire batch:

```evml
batch (
  exec $wxdai "deposit()" --value 0.001e18
  exec $wxdai "withdraw(uint)" 0.001e18
) -> Deposit(address indexed, uint) [_ $amount]
```

## Error Captures on Batches

You can capture revert errors from the entire batch. All three forms work:
assertion only, destructure, or boolean variable.

```evml
# Destructure the error reason
batch (
  exec $token "transfer(address,uint256)" @me 100e18
) -!> Error(string) [$reason]

# Assert a specific error without capturing data
batch (
  exec $token "transfer(address,uint256)" @me 100e18
) -!> Unauthorized()

# Boolean variable with optional capture
batch (
  exec $token "transfer(address,uint256)" @me 100e18
) -?!> Unauthorized() $reverted
```

## Nested Batching

Batches can contain control flow and other constructs:

```evml
batch (
  for $addr of $recipients (
    exec @token(DAI) "transfer(address,uint256)" $addr @token.amount(DAI 100)
  )
)
```

## Without Batch

By default, each `exec` command produces a separate transaction. Without
`batch`, a script like:

```evml
exec @token(DAI) "approve(address,uint256)" 0xRouter... @token.amount(DAI 1000)
exec 0xRouter... "swap(address,uint256)" @token(DAI) @token.amount(DAI 1000)
```

would submit two separate transactions — the second could fail independently
of the first.
