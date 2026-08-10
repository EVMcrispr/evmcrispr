---
title: "def"
---

Define a user command, helper, on-chain helper (`def @name!`), or module (`def module <name> ( ...defs )`), or return early from a command body (`def return`).

## Syntax

```evml
def <name> [params] [body]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `command \| helper` |  |
| `[params]` | `string` | Definition expression (see syntax variants below) |
| `[body]` | `expression \| block` |  |

## Examples

```evml
# Constant helper - returns a fixed address
def @myAddr "address" 0x44fA8E6f47987339850636F88629646662444217
set $result @myAddr

# Helper with typed parameters
def @double "$n: number -> number" @num($n * 2)
set $result @double(5)

# Boolean helper
def @isPositive "$n: number -> bool" @bool($n > 0)
set $result @isPositive(5)

# Composition
def @double "$n: number -> number" @num($n * 2)
def @quadruple "$n: number -> number" @double(@double($n))
set $result @quadruple(3)

# Inline module - a def of defs, used as if the module was loaded
def module math (
  def @double "$n: number -> number" @num($n * 2)
)
set $result @math:double(21)

# Guard clause - def return exits the command body early
def maybe-print "$n: number" (
  if @bool($n == 0) (
    def return
  )
  print $n
)
maybe-print 0
maybe-print 5
```

<!-- HAND-WRITTEN -->

## Syntax

```
# Define a constant helper
def @name "type" <value>

# Define a helper with parameters
def @name "$param1: type $param2: type -> returnType" <expression>

# Define a command
def commandName "$param1: type $param2: type" (
  ...
)

# Define an inline module (block may only contain defs)
def module moduleName (
  def @helperName "$n: type -> type" <expression>
  def commandName "$param: type" (
    ...
  )
)

# Return early from a command body
def return
```
## Notes

- The type signature string defines parameter names, types, and return type
- Parameters are prefixed with `$`, optional params wrapped in `[]`
- Helpers defined inside blocks (e.g. `if`) are scoped to that block
- Type inference: if the return type is omitted, it is inferred from the
  body. A `def @name!` is the exception and must be fully typed (below)

## On-chain definitions (`def @name!`)

A name ending in `!` defines an ON-CHAIN helper: one that compiles into an
assertion instead of running when the script is built.

```evml
load lang

set $vault 0x44fA8E6f47987339850636F88629646662444217

def @ge100! "$x: number -> bool" @bool!($x >= 100)
assert @all!($vault::{caps()(uint256[])} @ge100!)
```

This is the only way to write the predicate, transform or reducer that
`@all!`, `@any!`, `@filter!`, `@find!`, `@map!` and `@reduce!` apply. The
face takes the definition by NAME and supplies the arguments it declares.

Four things follow from a body that compiles rather than runs:

- **`@name` and `@name!` are independent.** Neither derives from the
  other; defining one leaves the other free, and they may have different
  bodies or none at all.
- **It cannot be called off-chain.** `set $x @ge100!(5)` is an error: there
  is nothing to run. Use it inside an assertion, or define the non-`!`
  twin.
- **It must be fully typed.** Return-type inference reads the body
  expecting helpers it can reason about off-chain, and an on-chain body is
  made of compile-only ones, so the signature has to say what inference
  otherwise would.
- **It is inlined, not called.** The body is compiled with the caller's
  argument expressions substituted for its parameters — which is why
  naming a parameter more than once is meaningful:

```evml
def @sq! "$x: number -> number" @num!($x * $x)
```

  `$x` appears twice, so the element is stamped at two places in one
  call rather than being read twice.

Two limits come from the same place. **Rest parameters** are refused,
because the calldata layout is fixed when the assertion is built and the
argument count has to be known then. **Recursion** is refused, directly or
mutually, because inlining a definition that reaches itself would never
terminate. Nesting is fine: `def @quad! "$x: number -> number"
@dbl!(@dbl!($x))` calls `@dbl!` twice and neither call is recursive.

## Early return

Inside a command body, `def return` stops executing the body — typically as
a guard clause:

```evml
def approve-if-any "$amount: number" (
  if @bool($amount == 0) (
    def return
  )
  print "approving" $amount
)
approve-if-any 0
```

Actions produced before the `def return` still execute. `return` and
`module` are reserved def names. A `def return` also exits from inside a
loop within the body; use [`loop break`](loop.md) to leave only the loop,
or [`exit`](exit.md) to stop the whole script.

## Modules

`def module <name> ( ...defs )` groups defs into an inline module — using it
is exactly like loading a module: its defs are available qualified as
`name:cmd` and `@name:helper`, and never leak unqualified into the script.
Inside the block, sibling defs resolve unqualified (shadowing same-named
caller defs). Module defs run isolated: their `set` bindings are scope-local
and they cannot read or write `$mod:key` config variables. `module` is a
reserved def name — nested module definitions are not allowed.

Module names shadow registered-but-unloaded modules (the editor warns, but
the script still runs — so a name you pick today keeps working even if a
future built-in module takes it). Only `std` is reserved, and defining a
name that is actually loaded in the script is an error.

A file containing exactly one `def module` command can be published to IPFS
and loaded remotely — see [load](load.md#external-evml-modules---from).

## See Also

- [set](set.md) — assign values to variables
- [loop](loop.md) — `loop break` / `loop continue`
- [exit](exit.md) — stop the whole script
