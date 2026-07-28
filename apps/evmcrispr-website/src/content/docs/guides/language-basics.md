---
title: Language Basics
---

EVMcrispr uses a custom DSL (domain-specific language) designed for writing
EVM transaction scripts. This guide covers the core syntax.

## Comments

Lines starting with `#` are comments:

```evml
# This is a comment
set $x 42  # Inline comments work too
```

## Commands

Commands are the primary building blocks. They produce transactions or
control program flow. Each command starts with its name followed by arguments:

```evml
exec 0x44fA8E6f47987339850636F88629646662444217 "transfer(address,uint256)" @me 100e18
set $greeting "hello"
print "The value is" $greeting
```

Arguments are separated by **spaces, not commas** — this applies everywhere
in EVML: command arguments, helper arguments, and array elements.

Commands from non-default modules use the module name as a prefix:

```evml
load aragonos
aragonos:connect my-dao.aragonid.eth (
  aragonos:grant CREATE_VOTES_ROLE on voting to @me
)
```

To drop the prefix, import the command on the `load` line (see
[Modules](#modules) below).

## Helpers

Helpers are expressions that produce values. They are prefixed with `@`:

```evml
set $sender @me                # No arguments
set $dai @token(DAI)           # Single argument
set $bal @get($dai "balanceOf(address)(uint256)" @me)  # Multiple arguments, space-separated
```

Helper arguments are space-separated: `@token:balance(DAI @me)` is correct,
`@token:balance(DAI, @me)` is a parse error.

Helpers can be nested and used as arguments to commands:

```evml
load token

exec @token(DAI) "transfer(address,uint256)" @me @token:amount(DAI 100)
```

## Variables

Use `set` to assign values and `$name` to reference them:

```evml
load token

set $recipient 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
set $amount @token:amount(DAI 1000)
exec @token(DAI) "transfer(address,uint256)" $recipient $amount
```

## Types

The DSL supports these value types:

| Type | Example | Description |
|------|---------|-------------|
| `address` | `0xAbCd...1234` | 20-byte Ethereum address |
| `number` | `42`, `100e18`, `1.5e6` | Integer or scientific notation |
| `string` | `"hello"`, `'it\'s fine'` | Quoted string (single or double); supports `\'`, `\"`, `\\`, `\n`, `\r`, `\t`, and `\u{HHHH}` escapes (any other `\X` is left literal); may span multiple lines |
| `bool` | `true`, `false` | Boolean |
| `bytes` | `0xdeadbeef` | Hex-encoded bytes |
| `bytes32` | `0x00...001` | 32-byte value |
| `array` | `[1 2 3]` | Ordered collection — elements are space-separated, never commas |

Numbers support scientific notation with `e`: `100e18` means `100 * 10^18`.
This is useful for token amounts with 18 decimals.

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

Note there is no `else` keyword: `if` takes a condition, a then-block, and
an optional second block that runs when the condition is false.

## ABI Signatures

Contract function signatures follow Solidity syntax. Inside a signature
string the parameter types **are** comma-separated, exactly as in Solidity:

```evml
# Write functions (for exec): inputs only
exec @token(DAI) "transfer(address,uint256)" @me 100e18
exec @token(DAI) "approve(address,uint256)" @me 100e18

# Read functions (for @get): append (returnTypes) directly after the inputs
set $bal @get(@token(DAI) "balanceOf(address)(uint256)" @me)
set $name @get(@token(DAI) "name()(string)")
set $reserves @get(0x44fA8E6f47987339850636F88629646662444217 "getReserves()(uint112,uint112,uint32)")
```

The read format is `"name(inputTypes)(returnTypes)"` — two parenthesized
lists back to back with **no colon or other separator** between them
(`"name()(string)"`, not `"name():(string)"`).

## Modules

The `std` module is loaded by default — its commands (`set`, `exec`,
`print`, …) and helpers (`@me`, `@token(...)`, …) never need a prefix.
Load additional modules with:

```evml
load aragonos
load sim
load ens
load http
```

After loading, use their commands and helpers with the module prefix
(`mod:command`, `@mod:helper`):

```evml
load sim
sim:fork (
  sim:set-balance @me 100e18
  exec 0x44fA8E6f47987339850636F88629646662444217 "foo()"
)
```

### Import Lists

To use module names without the prefix, list them on the `load` line.
Barewords import commands; `@name` entries import helpers:

```evml
load sim [fork set-balance expect]
load aragonos [grant @app]

fork (
  set-balance @me 100e18
  expect @bool(1 == 1)
)
```

The import list is the whole mechanism: an unqualified name resolves to an
in-script `def`, a name imported on a `load` line, or the `std` prelude —
nothing else. Blocks don't change resolution (being inside
`aragonos:connect (...)` does not make bare `grant` mean `aragonos:grant`
unless you imported it), so what a name means is always visible in the
script itself, and a module update can never change it behind your back.

### Renames

Use `>` inside the import list to bind a module name to a different
unqualified name — for example when it would collide with a `std` command
or another import:

```evml
load sim [fork>simulate set-balance]

simulate (
  set-balance @me 100e18
)
```

The qualified form is unaffected: `sim:fork` still works. Helper renames
work the same way: `load aragonos [@app>@aragonApp]` makes the helper
available as `@aragonApp(...)` (and still as `@aragonos:app(...)`).

## Options

Some commands accept options with `--name value`:

```evml
exec 0x44fA8E6f47987339850636F88629646662444217 "foo()" --value 1e18
exec 0x44fA8E6f47987339850636F88629646662444217 "foo()" --from 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
```

A command and all of its options must be written on a single line — EVML
has no `\` line continuation.

## Event Captures

The `exec` command can capture events emitted by the transaction:

```evml
exec 0x44fA8E6f47987339850636F88629646662444217 "createPool(address,uint24)" @token(DAI) 3000 -> Transfer [_ $pool]
```

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

## Arithmetic & Boolean Expressions

Use `@num()` for arithmetic and `@bool()` for boolean logic:

```evml
set $a 1
set $b 2
set $total @num($a + $b * 2)

set $x 5
set $y 50
set $isValid @bool($x > 0 and $y < 100)
```

## Control Flow

```evml
load token

# Conditional
set $balance @token:balance(DAI @me)
if @bool($balance > 0) (
  print "Has balance"
)

# Loop over array
loop $item of @arr(0 10) (
  print $item
)

# Loop until a condition is true
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
