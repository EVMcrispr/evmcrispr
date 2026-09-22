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

Use `-!>` to catch a failed command: a transaction that reverts, or a command
that refuses to run before any transaction exists (a failed preflight, an
amount below a protocol minimum, a missing argument). After the error name you
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

Use `-?!>` if the error is optional (the command may or may not fail).
With a boolean variable, `$e` is `"true"` when that clause matched and
`"false"` when the line succeeded:

```evml
set $c 0x44fA8E6f47987339850636F88629646662444217

exec $c "maybeRevert()" -?!> Error(string) [$reason]
exec $c "maybeRevert()" -?!> Unauthorized() $e
```

Supported error types:
- **Declared errors**: named refusals a command or helper documents (below)
- **Custom named errors**: `revert CustomError(arg1, arg2)`
- **Error(string)**: `require(cond, "msg")` / `revert("msg")`
- **Panic(uint256)**: `assert(cond)` failures
- **Empty reverts**: pre-0.4.22 `revert()` with no data

The generic forms (no error name) accept any failure a capture can see at
all: a revert decodes as usual (`Error(string)` reason, `Panic(uint256)`
code, raw custom-error bytes), while a command that fails before sending
supplies its own message — `-!> $e` turns `"true"` and `-!> [$reason]`
receives that message, which for a declared refusal is the one written where
it was raised. This is how a loop skips the entries a command cannot serve at
all:

```evml novalidate
loop $token of @token:holdings(@sender) (
  swaps:twap $order max $token to $usdc --parts 4 --every 1800 --price-protection 1 -?!> $skipped
)
```

A blanket `-?!> $skipped` swallows everything, though — a typo in an option,
an RPC outage and a token the command genuinely cannot serve all read the
same. Named **declared errors** are the precise version of that loop.

### Declared errors

A module declares, next to a command's arguments and options, the ways that
command can refuse to run: a name, a description and optionally a few typed
fields. Every declared error is listed in the **Errors** section of the
command's or helper's reference page, and a script accepts one by name —
never by matching message text:

```evml novalidate
loop $token of @token:holdings(@sender) (
  swaps:twap $order max $token to $usdc --parts 4 --every 1800 --price-protection 1 -?!> SameToken -?!> BelowMinimum -?!> NoBalance -?!> Unfunded
)
```

That loop skips the four cases the command documents and stops the script on
anything else — a bad option, a failing quote service, a bug.

A declared error carries its fields the same way a contract's custom error
does, so the destructure works identically, and `_` skips a field:

```evml novalidate
swaps:twap $order max $gno to $usdc --parts 4 --every 1800 --min 1 -?!> BelowMinimum [$minimum]
```

Declarations list a module's **supported refusals, not every possible
exception**. A declaring command can still fail in undeclared ways — invalid
input, a service being down, a contract reverting — and those failures are not
matched by a declared name. A command that declares errors may also revert
on-chain, and those reverts keep their usual named captures.

### Helpers refuse too

A helper declares errors the same way, and raises them while the command line
evaluates its arguments. The capture belongs to the command line — a helper
only ever runs as part of one — and both arrows accept the refusal.

Permit the refusal with `-?!>` — the line may also succeed, and the script
carries on either way:

```evml
load token
set $safe 0x44fA8E6f47987339850636F88629646662444217

set $tokens @token:holdings($safe) -?!> NoExplorer
```

Or require it with `-!>`, where a successful line is an assertion failure:

```evml
load token
set $safe 0x44fA8E6f47987339850636F88629646662444217

set $tokens @token:holdings($safe) -!> NoExplorer [$chain]
```

When a helper's refusal is captured, the command body never runs: `set` does
not assign `$tokens`, and an earlier binding of `$tokens` keeps its value.
A capture never turns an error into an expression value — it does not hand the
helper a replacement result or resume it. What it writes are its own named
variables, so binding a field to the assignment target is an ordinary
destructure:

```evml novalidate
# Failure(first second) — bind the second field to $x.
set $x @gonnaFail -!> Failure [_ $x]
```

### Several clauses on one line

Repeat a clause to accept any of several errors. The line is accepted when
**at least one** clause matches; each flag reads `"true"` or `"false"` for its
own clause, and only the matching clause's destructure is applied:

```evml
set $c 0x44fA8E6f47987339850636F88629646662444217

exec $c "deny()" -?!> Unauthorized() $denied -?!> Error(string) [$reason]
```

`-!>` on any clause makes failure required, so a mixed list still requires the
line to fail and accepts whichever clause matches. When every clause is `-?!>`
and the line succeeds, all their flags read `"false"`.

### When nothing matches

If no clause matches, the original failure propagates unchanged and no capture
variable is written: a revert stays a revert, a declared refusal stays that
declared error, with the failing line's location. Nothing is substituted, and
a named clause that did not match never reports a decoding error of its own.

### Naming an error

A bare `Name` is resolved against the declared errors of the command and of
the helpers on its line first, then against the target contract's ABI (plus
the built-in `Error(string)` and `Panic(uint256)`). Matching needs the
selector *and* a payload that decodes, so a declared `SameToken()` matches an
on-chain `SameToken()` but never `SameToken(uint256)`.

Spell the signature to pick one exactly — `-!> SameToken(uint256)`. You have
to when two declarations on the same line share a name with different
signatures: that bare name is ambiguous and the script stops before the line
runs. A bare *contract* error name matches whichever overload reverted, so
with an overloaded name the number of fields a destructure receives depends on
the failure — spell the signature there too.

### What a capture does not undo

Capturing a failure is not a rollback. Variables bound earlier in the script
keep their values, off-chain effects stay done, and a multi-action command
keeps the transactions it already sent. A refusal meant for a skip-and-continue
loop is raised before anything is sent, which is what makes the loop above
safe; that is a property of the command, not of the capture.

### Where a failure can be observed

Error-only captures also work on commands that send nothing, such as `set`:
optional flags read `"false"` on success, and a required capture fails the
script because the line succeeded.

Inside a block that collects its calls into one transaction (`batch`,
`safe:execute`, a DAO proposal) the send happens later, so a capture there
covers the command (or its helpers) refusing to run — with either arrow — and
lets prepared actions through. A revert of the outer transaction happens after
the block is composed, so `-!>` cannot assert it from inside; put the required
capture on a command that sends its own transaction. A smart batch (`batch!`)
refuses an inner required capture for the same reason; to require a revert
there, assert it on-chain with
`assert @reverts!(0xTarget::!{withdraw(uint256)() 100} -!> InsufficientBalance(uint256,uint256))`.

### What stays uncapturable

Only what a module declares is part of its contract. A helper failure that is
not declared — a missing variable, a typo in a helper name, a failed
read — is a script error, and not even `-?!> $e` swallows it. Control-flow
signals (`break`, `continue`, `return`, `exit`) are not errors and pass
through untouched.

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

Both forms compose with the [receipts](/reference/receipts/) module ⚗️ — capture the hash, then read
anything about it:

```evml
load receipts
exec @token(DAI) "transfer(address,uint256)" @me 1e18 $> $tx
print @receipts:tx($tx)
print @receipts:tx.fee($tx)
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
failure aborts the block before the capture could observe it, so they are
refused outright: the script stops before the block runs, and the fix is to
put `-!>` on the inner command instead.
