---
title: Captures
---

Captures pull data out of a command line into script variables: the hash of
its transaction (`$>`, `$*>`), the events that transaction emitted (`->`), or
the failure it ran into.

A line can fail at two different times, and each timing has its own arrow.
It can **refuse** while the script is being prepared — a declared error, a
helper that cannot answer, a failed preflight, a missing argument — and
nothing is sent. Or its transaction can **revert** on chain, after it was
sent. `-/>` and `-?/>` capture a refusal; `-!>` and `-?!>` capture a revert.

| Timing | Required | Optional |
|---|---|---|
| Build time, before anything is sent | `-/>` | `-?/>` |
| On chain, after the transaction executes | `-!>` | `-?!>` |

The `!` keeps the meaning it has in `@helper!`, `::!` and `batch!`: on chain.
The `/` strikes the arrow through — the line was cut off before it reached
the chain. The `?` makes the failure optional either way.

The two families never compete for one failure. A line that refuses is judged
by its refusal clauses only; a line that sends and reverts, by its revert
clauses only.

## Refusal captures

A refusal capture fires when the line fails **before anything is sent**:
while resolving its arguments, while the command runs its body, or, inside a
block that collects calls, while the line's actions are composed.

### Declared errors

A module declares, next to a command's arguments and options, the ways that
command can refuse to run: a name, a description and optionally a few typed
fields. Every declared error is listed in the **Errors** section of the
command's or helper's reference page, and a script accepts one by name —
never by matching message text:

```evml novalidate
loop $token of @token:holdings(@sender) (
  swaps:twap $order max $token to $usdc --parts 4 --every 1800 --price-protection 1 -?/> SameToken -?/> BelowMinimum -?/> NoBalance -?/> Unfunded
)
```

That loop skips the four cases the command documents and stops the script on
anything else — a bad option, a failing quote service, a bug.

A declared error carries its fields the same way a contract's custom error
does, so the destructure works identically, and `_` skips a field:

```evml novalidate
swaps:twap $order max $gno to $usdc --parts 4 --every 1800 --min 1 -?/> BelowMinimum [$minimum]
```

A name after a refusal arrow is resolved **only** against the declarations of
the line: the command's own, then those of every helper reachable in its
arguments and options. A contract's custom error never answers to a refusal
arrow, and a declared name never answers to a revert arrow.

Declarations list a module's **supported refusals, not every possible
exception**. A declaring command can still fail in undeclared ways — invalid
input, a service being down — and those failures are not matched by a
declared name. A command that declares refusals may also revert on chain, and
that revert is captured with `-!>` / `-?!>` on the same line.

### Helpers refuse too

A helper declares errors the same way, and raises them while the command line
evaluates its arguments. The capture belongs to the command line — a helper
only ever runs as part of one — and it is a refusal of that line.

Permit the refusal with `-?/>` — the line may also succeed, and the script
carries on either way:

```evml
load token
set $safe 0x44fA8E6f47987339850636F88629646662444217

set $tokens @token:holdings($safe) -?/> NoExplorer
```

Or require it with `-/>`, where a successful line is an assertion failure
("expected the line to refuse, but it succeeded"):

```evml
load token
set $safe 0x44fA8E6f47987339850636F88629646662444217

set $tokens @token:holdings($safe) -/> NoExplorer [$chain]
```

When a helper's refusal is captured, the command body never runs: `set` does
not assign `$tokens`, and an earlier binding of `$tokens` keeps its value.
A capture never turns an error into an expression value — it does not hand the
helper a replacement result or resume it. What it writes are its own named
variables, so binding a field to the assignment target is an ordinary
destructure:

```evml novalidate
# Failure(first second) — bind the second field to $x.
set $x @gonnaFail -/> Failure [_ $x]
```

### Any refusal at all

Leave the name out and the clause takes **any** capturable failure raised
before sending: a declared error of the command or of a helper on the line, or
an ordinary failure the command raises itself. `-?/> $e` turns `"true"`, and
`-?/> [$reason]` receives the message written where the failure was raised.

```evml novalidate
loop $token of @token:holdings(@sender) (
  swaps:twap $order max $token to $usdc --parts 4 --every 1800 --price-protection 1 -?/> $skipped
)
```

A blanket `-?/> $skipped` swallows a lot, though — a bad option value and a
token the command genuinely cannot serve read the same. Named declared errors
are the precise version of that loop.

A chain-shaped failure counts as a refusal when it happens before the send. An
inline call in an argument reads the chain while the line is being prepared,
so a revert of that read is a refusal of the line, not a revert of its
transaction:

```evml
set $c 0x44fA8E6f47987339850636F88629646662444217

exec $c "withdraw(uint256)" $c::{limitOf(address)(uint256) @me} -?/> $unavailable
```

### Refusals on commands that send nothing

Refusal captures work on commands that send no transaction at all, such as
`set`: an optional flag reads `"false"` when the line succeeds, and a required
`-/>` fails the script because the line succeeded.

### Refusals inside blocks

Inside a block that collects its calls into one transaction (`batch`,
`safe:execute`, a DAO proposal) the send happens later, but the refusal
happens right there while the line is composed — so refusal captures work
exactly as they do at the top level, and the actions already prepared by the
other lines are let through:

```evml
load safe
load swaps
load token

set $safe 0x1111111111111111111111111111111111111111
set $usdc @token(USDC)
set $tokens @token:holdings($safe)

safe:execute $safe (
  loop $token of $tokens (
    swaps:twap $order max $token to $usdc --parts 4 --every 1800 --price-protection 1 -?/> SameToken -?/> BelowMinimum -?/> NoBalance -?/> Unfunded
  )
)
```

A smart batch (`batch!`) accepts them too. There, a matched refusal rolls the
plan back to the failing line's checkpoint — the steps that line had already
contributed are dropped, and the local bindings it wrote are restored — so the
batch continues from a clean state.

## Revert captures

A revert capture fires when a transaction the line **sent** fails. After the
error name you can add a destructure (`[...]`), a boolean variable (`$var`),
or nothing:

```evml
set $c 0x44fA8E6f47987339850636F88629646662444217

# Assert a specific error (no data captured)
exec $c "deny()" -!> Unauthorized()

# Destructure error arguments into variables
exec $c "withdraw(uint256)" 200 -!> InsufficientBalance(uint256,uint256) [$balance $required]

# Catch a require/revert reason
exec $c "transfer(address,uint256)" @me 100e18 -!> Error(string) [$reason]

# Boolean variable — $e is "true" if the error matched
exec $c "deny()" -!> Unauthorized() $e

# Generic catch-all (no error name)
exec $c "doSomething()" -!> [$reason]
exec $c "doSomething()" -!> $e
```

Use `-?!>` if the revert is optional (the transaction may or may not fail).
With a boolean variable, `$e` is `"true"` when that clause matched and
`"false"` when the transaction succeeded:

```evml
set $c 0x44fA8E6f47987339850636F88629646662444217

exec $c "maybeRevert()" -?!> Error(string) [$reason]
exec $c "maybeRevert()" -?!> Unauthorized() $e
```

A name after a revert arrow resolves **only** in the failing transaction's
target ABI plus the two Solidity builtins:

- **Custom named errors**: `revert CustomError(arg1, arg2)`
- **Error(string)**: `require(cond, "msg")` / `revert("msg")`
- **Panic(uint256)**: `assert(cond)` failures
- **Empty reverts**: pre-0.4.22 `revert()` with no data

The generic form takes any revert and decodes it as usual: an `Error(string)`
reason, a `Panic(uint256)` code, or the raw custom-error bytes.

A declared name is not in that source. If the line's command or one of its
helpers declares an error with the same name, spelling it bare after a revert
arrow is an error — `"SameToken" is a refusal declared by this line; capture
it with -/> or -?/>`. When the contract really does revert with an error of
that name, spell the signature inline (`-?!> SameToken(uint256)`) and the
clause reads it from the ABI.

### Reverts need an execution context

A revert capture can only be judged by running the transaction, so it needs an
interactive run or a `sim:fork` block; validating or previewing a script
executes nothing. A line that turns out to send no transaction at all fails a
required `-!>` with "expected a revert, but the line sent no transaction", and
clears an optional `-?!>` flag to `"false"`. On a command that never sends —
`set`, `print`, `load`, `switch` — the editor flags the revert capture before
you run it.

**A pre-send failure is not swallowed by a revert arrow.** A line carrying
only `-!>` / `-?!>` that refuses before sending propagates that refusal
untouched, with its own message and location, and the revert flags stay unset.

### Reverts cannot be caught inside a block

Inside a collecting block the outer transaction is sent after the block is
composed, so no inner line can observe its revert. A revert capture there is
refused before the block runs: *revert captures inside a block cannot observe
the outer transaction; capture it on the block command instead*. Put it on the
block command, which does send:

```evml
set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb

batch (
  exec $token "transfer(address,uint256)" @me 100e18
) -?!> Error(string) [$reason]
```

A smart batch (`batch!`) refuses them for the same reason, and points at the
on-chain form instead. `-!>` reports:

> revert captures cannot observe a revert inside a smart batch; assert it
> instead: `assert @reverts!(<target>::!{<signature>} -!> Name())`

and `-?!>` reports:

> revert captures cannot catch a revert inside a smart batch; branch on it
> instead: `if @reverts!(<target>::!{<signature>} -!> Name()) ( … )`

The `-!>` inside an `@reverts!(...)` probe is that helper's own clause syntax:
it names the reason the probe is looking for, and is unrelated to the capture
arrows on a command line.

## Rules shared by both

### Several clauses on one line

Repeat a clause to accept any of several errors. The line is accepted when
**at least one** clause matches; each flag reads `"true"` or `"false"` for its
own clause, and only the matching clause's destructure is applied:

```evml
set $c 0x44fA8E6f47987339850636F88629646662444217

exec $c "deny()" -?!> Unauthorized() $denied -?!> Error(string) [$reason]
```

A required clause makes failure required for its own family: any `-/>` on the
line requires the line to refuse, any `-!>` requires its transaction to
revert. When every clause is optional and the line succeeds, all their flags
read `"false"`.

Both families may appear on one line, and each is evaluated at its own time.
If the line refuses, its refusal clauses are consulted and the revert flags
read `"false"`; if it composes and sends, the refusal flags read `"false"` and
the revert clauses are consulted against the transaction's outcome:

```evml
load token
set $c 0x44fA8E6f47987339850636F88629646662444217

exec $c "withdraw(uint256)" @token:amount(DAI 1) -?/> $refused -?!> Error(string) [$reason]
```

Requiring both is a contradiction — a line cannot refuse before sending *and*
revert after — so `-/>` together with `-!>` is rejected before the script
runs. Requiring one while permitting the other is fine.

### When nothing matches

If no clause matches, the original failure propagates unchanged and no capture
variable is written: a revert stays a revert, a declared refusal stays that
declared error, with the failing line's location. Nothing is substituted, and
a named clause that did not match never reports a decoding error of its own.

### Naming an error

Matching needs the selector *and* a payload that decodes, so a declared
`SameToken()` matches a raised `SameToken()` but never `SameToken(uint256)`.

Spell the signature to pick one exactly — `-/> SameToken(uint256)`. You have
to when two declarations on the same line share a name with different
signatures: that bare name is ambiguous and the script stops before the line
runs. A bare *contract* error name matches whichever overload reverted, so
with an overloaded name the number of fields a destructure receives depends on
the failure — spell the signature there too.

### What a capture does not undo

Capturing a failure is not a rollback. Variables bound earlier in the script
keep their values, off-chain effects stay done, and a multi-action command
keeps the transactions it already sent. A refusal meant for a
skip-and-continue loop is raised before anything is sent, which is what makes
the loop above safe; that is a property of the command, not of the capture.
The one place a capture does undo something is a smart batch, where a matched
refusal truncates the plan to the failing line's checkpoint.

### What stays uncapturable

Only what a module declares is part of its contract. A helper failure that is
not declared — a missing variable, a typo in a helper name, a read that
reverts inside the helper — is a script error, and neither `-?/> $e` nor
`-?!> $e` swallows it. Control-flow signals (`break`, `continue`, `return`,
`exit`) are not errors and pass through untouched.

## Event Captures

The `exec` command can capture events emitted by the transaction with `->`:

```evml
exec 0x44fA8E6f47987339850636F88629646662444217 "createPool(address,uint24)" @token(DAI) 3000 -> Transfer [_ $pool]
```

The destructure list binds event arguments positionally; use `_` to skip
one.

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
print @receipts:tx.fee($tx)
```

Tx captures can be combined with event captures (the transactions execute
once, serving both) but not with error captures of either family — a line that
refuses sends nothing, and a reverted transaction has no meaningful hash to
capture.

Like all captures, they need an execution context (an interactive run or a
`sim:fork` block); validating or previewing a script does not execute
transactions, so there is nothing to capture.

## Captures on Batches

All capture forms also work on a whole `batch` block, which executes as a
single transaction — so `$> $tx` on a batch binds one hash for the whole
bundle, and `-?!>` on it catches the combined revert. See
[Blocks & Batching](blocks-and-batching.md).

Event and tx captures also work on `if`/`loop` blocks and `def` commands:
the inner transactions execute inside the block exactly once, and the
capture reads their receipts. Error captures are the exception — an inner
failure aborts the block before the capture could observe it, so all four
arrows are refused outright on a block command: the script stops before the
block runs, and the fix is to capture on the inner command instead.
