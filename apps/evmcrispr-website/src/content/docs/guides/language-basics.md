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
exec 0xAbC... "transfer(address,uint256)" @me 100e18
set $greeting "hello"
print "The value is" $x
```

Commands from non-default modules use a prefix:

```evml
load aragonos
aragonos:connect my-dao.aragonid.eth (
  aragonos:grant @me voting CREATE_VOTES_ROLE
)
```

## Helpers

Helpers are expressions that produce values. They are prefixed with `@`:

```evml
@me                                           # No arguments
@token(DAI)                                   # Single argument
@get(0xAbC... "balanceOf(address)(uint256)" @me)  # Multiple arguments
```

Helpers can be nested and used as arguments to commands:

```evml
exec @token(DAI) "transfer(address,uint256)" @me @token.amount(DAI 100)
```

## Variables

Use `set` to assign values and `$name` to reference them:

```evml
set $recipient 0x1234...
set $amount @token.amount(DAI 1000)
exec @token(DAI) "transfer(address,uint256)" $recipient $amount
```

## Types

The DSL supports these value types:

| Type | Example | Description |
|------|---------|-------------|
| `address` | `0xAbCd...1234` | 20-byte Ethereum address |
| `number` | `42`, `100e18`, `1.5e6` | Integer or scientific notation |
| `string` | `"hello"` | Quoted string |
| `bool` | `true`, `false` | Boolean |
| `bytes` | `0xdeadbeef` | Hex-encoded bytes |
| `bytes32` | `0x00...001` | 32-byte value |
| `array` | `[1 2 3]` | Ordered collection |

Numbers support scientific notation with `e`: `100e18` means `100 * 10^18`.
This is useful for token amounts with 18 decimals.

## Blocks

Some commands accept a block of sub-commands in parentheses:

```evml
batch (
  exec 0xA... "foo()"
  exec 0xB... "bar()"
)

for $i in @range(0 5) (
  print $i
)

if @bool($x > 0) (
  print "positive"
) else (
  print "non-positive"
)
```

## ABI Signatures

Contract function signatures follow Solidity syntax:

```evml
# Write functions (for exec)
"transfer(address,uint256)"
"approve(address,uint256)"

# Read functions (for @get) — include (returnType) after inputs
"balanceOf(address)(uint256)"
"name()(string)"
"getReserves()(uint112,uint112,uint32)"
```

## Modules

The `std` module is loaded by default. Load additional modules with:

```evml
load aragonos
load sim
load ens
load http
```

After loading, use their commands and helpers with the module prefix:

```evml
load sim
sim:fork 1 (
  sim:set-balance @me 100e18
  exec 0xAbC... "foo()"
)
```

## Options

Some commands accept options with `--name value`:

```evml
exec 0xAbC... "foo()" --value 1e18
exec 0xAbC... "foo()" --from 0x1234...

load aragonos --as dao
```

## Event Captures

The `exec` command can capture events emitted by the transaction:

```evml
exec 0xAbC... "createPool(address,uint24)" @token(DAI) 3000 -> Transfer [_ $pool]
```

## Error Captures

Use `-!>` to catch and decode transaction reverts. After the error name you
can add a destructure (`[...]`), a boolean variable (`$var`), or nothing:

```evml
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
set $total @num($a + $b * 2)
set $isValid @bool($x > 0 and $y < 100)
```

## Control Flow

```evml
# Conditional
if @bool($balance > 0) (
  print "Has balance"
)

# Loop over array
for $item in @range(0 10) (
  print $item
)

# While loop
set $i 0
while @bool($i < 5) (
  print $i
  set $i @num($i + 1)
)
```

## User-Defined Commands and Helpers

Use `def` to define reusable commands and helpers:

```evml
# Define a helper
def @double "$x: number -> number" (
  @num($x * 2)
)

# Define a command
def transfer($token $to $amount) (
  exec @token($token) "transfer(address,uint256)" $to @token.amount($token $amount)
)

# Use them
set $result @double(21)
transfer DAI 0x1234... 100
```
