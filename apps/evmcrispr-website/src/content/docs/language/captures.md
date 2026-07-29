---
title: Captures
---

Captures pull data out of a command's executed transaction into script
variables: its hash (`$>`, `$*>`), events it emitted (`->`), or the error it
reverted with (`-!>`).

## Event Captures

The `exec` command can capture events emitted by the transaction with `->`:

```evml
exec 0x44fA8E6f47987339850636F88629646662444217 "createPool(address,uint24)" @token(DAI) 3000 -> Transfer [_ $pool]
```

The destructure list binds event arguments positionally; use `_` to skip
one.

## Error Captures

Use `-!>` to catch and decode transaction reverts. After the error name you
can add a destructure (`[...]`), a boolean variable (`$var`), or nothing:

```evml
set $c 0x44fA8E6f47987339850636F88629646662444217

# Assert a specific error (no data captured)
exec $c "deny()" -!> Unauthorized()

# Destructure error arguments into variables
exec $c "withdraw(uint256)" 200 -!> InsufficientBalance(uint256,uint256) [$balance $required]

# Catch a require/revert reason
exec $c "transfer(address,uint256)" @me 100e18 -!> Error(string) [$reason]

# Boolean variable — $e is "true" if error matched
exec $c "deny()" -!> Unauthorized() $e

# Generic catch-all (no error name)
exec $c "doSomething()" -!> [$reason]
exec $c "doSomething()" -!> $e
```

Use `-?!>` if the error is optional (transaction may or may not revert).
With a boolean variable, `$e` is `"true"` on match, `"false"` on success or
mismatched error:

```evml
set $c 0x44fA8E6f47987339850636F88629646662444217

exec $c "maybeRevert()" -?!> Error(string) [$reason]
exec $c "maybeRevert()" -?!> Unauthorized() $e
```

Supported error types:
- **Custom named errors**: `revert CustomError(arg1, arg2)`
- **Error(string)**: `require(cond, "msg")` / `revert("msg")`
- **Panic(uint256)**: `assert(cond)` failures
- **Empty reverts**: pre-0.4.22 `revert()` with no data

## Transaction Hash Captures

Redirect a command's transaction hash into a variable with `$>`:

```evml
exec @token(DAI) "transfer(address,uint256)" @me 1e18 $> $tx
```

`$> $var` binds the hash of the command's **last** transaction — the primary
one. Compound commands may send prerequisite transactions first (an
`approve`, an ENS commit), and whether they do can vary between runs, so
the last hash is the stable notion of "the command's transaction".

When you want every hash, `$*> $var` binds them **all** as an array, newest
last:

```evml
load ens
ens:register myname.eth @me 1y $*> $txs
```

There is deliberately no positional destructuring for tx hashes: because
prerequisite transactions are conditional, a fixed-count pattern would bind
different transactions on different runs.

Both forms compose with the [explorer](/reference/explorer/) module ⚗️ — capture the hash, then read
anything about it:

```evml
load explorer
exec @token(DAI) "transfer(address,uint256)" @me 1e18 $> $tx
print @explorer:tx($tx)
print @explorer:tx.fee($tx)
```

Tx captures can be combined with event captures (the transactions execute
once, serving both) but not with error captures — a reverted transaction
has no meaningful hash to capture.

Like all captures, they need an execution context (an interactive run or a
`sim:fork` block); validating or previewing a script does not execute
transactions, so there is nothing to capture.

## Captures on Batches

All capture forms also work on a whole `batch` block, which executes as a
single transaction — so `$> $tx` on a batch binds one hash for the whole
bundle. See [Blocks & Batching](blocks-and-batching.md).

Event and tx captures also work on `if`/`loop` blocks and `def` commands:
the inner transactions execute inside the block exactly once, and the
capture reads their receipts. Error captures are the exception — an inner
revert aborts the block before the capture could observe it, so put `-!>`
on the inner command instead.
