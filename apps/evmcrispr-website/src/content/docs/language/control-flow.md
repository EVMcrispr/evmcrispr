---
title: Control Flow
---

Control-flow commands take [blocks](blocks-and-batching.md) — groups of
sub-commands in parentheses — and run them conditionally or repeatedly.

## Conditionals

`if` takes a condition, a then-block, and an optional second block that runs
when the condition is false. There is no `else` keyword:

```evml
load token

set $balance @token:balance(DAI @me)
if @bool($balance > 0) (
  print "Has balance"
) (
  print "No balance"
)
```

## Loops

Loop over an array with `loop $var of`:

```evml
loop $item of @arr(0 10) (
  print $item
)
```

Or repeat until a condition becomes true:

```evml
set $i 0
loop until @bool($i >= 5) (
  print $i
  set $i @num($i + 1)
)
```

## User-Defined Commands and Helpers

Use `def` to define reusable commands and helpers:

```evml
# Define a helper — the body is a single expression, not a block
def @double "$x: number -> number" @num($x * 2)

# Define a command — params live in the signature string, the body is a block
def transfer "$token: address $to: address $amount: number" (
  exec $token "transfer(address,uint256)" $to $amount
)

# Use them
set $result @double(21)
transfer @token(DAI) 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 100e18
```

Groups of defs can be bundled into an inline module with
`def module <name> ( ...defs )` — see [Modules & Imports](modules.md).

## Next Steps

- [Blocks & Batching](blocks-and-batching.md) — how blocks work and atomic execution
- [Values & Variables](values-and-variables.md) — the expressions that drive conditions
