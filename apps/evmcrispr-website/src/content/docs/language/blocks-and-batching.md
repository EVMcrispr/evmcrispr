---
title: Blocks & Batching
---

## Blocks

Some commands accept a block of sub-commands in parentheses:

```evml
batch (
  exec 0x44fA8E6f47987339850636F88629646662444217 "foo()"
  exec 0x0102030405060708090a0b0c0d0e0f1011121314 "bar()"
)

loop $i of @arr(0 5) (
  print $i
)

set $x 10
if @bool($x > 0) (
  print "positive"
) (
  print "non-positive"
)
```

A block does not change name resolution — what a command name means is
decided by `load` import lists and `def`s alone, never by the block it
appears in (see [Modules & Imports](modules.md)).

## Smart blocks

`batch`, `safe:propose`, `safe:execute`, and `safe:verify` also accept `!(...)`. The bang belongs to the block and enables execution-time values through explicit `@helper!` expressions and return capture. Other commands accept ordinary `(...)` blocks; `if`, `loop`, and user-defined command bodies inside a smart payload inherit its execution context. See [Smart batches](/guides/smart-batches/).

## Batching

By default, each `exec` command produces a separate transaction. A script
like:

```evml
load token

set $router 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D

exec @token(DAI) "approve(address,uint256)" $router @token:amount(DAI 1000)
exec $router "swap(address,uint256)" @token(DAI) @token:amount(DAI 1000)
```

submits two separate transactions — the second could fail independently of
the first. Wrap commands in `batch` to combine them into one atomic
transaction:

```evml
load token

set $router 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D

batch (
  exec @token(DAI) "approve(address,uint256)" $router @token:amount(DAI 1000)
  exec $router "swap(address,uint256)" @token(DAI) @token:amount(DAI 1000)
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
set $wxdai 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d

batch (
  exec $wxdai "deposit()" --value 0.001e18
  exec $wxdai "withdraw(uint)" 0.001e18
) -> Deposit(address indexed, uint) [_ $amount]
```

A batch executes as one transaction, so a [tx capture](captures.md) on
it binds a single hash for the whole bundle:

```evml
set $wxdai 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d

batch (
  exec $wxdai "deposit()" --value 0.001e18
  exec $wxdai "withdraw(uint)" 0.001e18
) $> $tx
```

## Revert Captures on Batches

You can capture the revert of the batch's combined transaction with `-!>` /
`-?!>`. All three forms from [Captures](captures.md) work: assertion only,
destructure, or boolean variable.

```evml
set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb

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

A revert capture belongs on the batch command, not on a line inside it: the
combined transaction is sent after the block is composed, so an inner line
cannot observe its revert and the script stops before the block runs. A line
inside the block can still capture its own build-time refusal with `-/>` /
`-?/>` — see [Refusal captures](captures.md#refusal-captures).

## Nested Batching

Batches can contain control flow and other constructs:

```evml
load token

set $recipients [0x4F2083f5fBede34C2714aFfb3105539775f7FE64 0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6]

batch (
  loop $addr of $recipients (
    exec @token(DAI) "transfer(address,uint256)" $addr @token:amount(DAI 100)
  )
)
```
