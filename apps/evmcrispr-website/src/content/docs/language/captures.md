---
title: Event & Error Captures
---

Captures decode data out of a transaction — events it emitted or the error
it reverted with — into script variables.

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

## Captures on Batches

Both capture forms also work on a whole `batch` block — see
[Blocks & Batching](blocks-and-batching.md).
