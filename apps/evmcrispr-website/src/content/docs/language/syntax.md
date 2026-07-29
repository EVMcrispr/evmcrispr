---
title: Syntax
---

EVML is the domain-specific language EVMcrispr scripts are written in. It is
line-oriented: each line is a command, and expressions produce the values
commands consume. This page covers the basic shapes; the rest of this
section goes deeper into each part of the language.

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
[Modules & Imports](modules.md)).

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

## Options

Some commands accept options with `--name value`:

```evml
exec 0x44fA8E6f47987339850636F88629646662444217 "foo()" --value 1e18
exec 0x44fA8E6f47987339850636F88629646662444217 "foo()" --from 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
```

A command and all of its options must be written on a single line — EVML
has no `\` line continuation.

## Next Steps

- [Values & Variables](values-and-variables.md) — types, `set`, and expressions
- [ABI Signatures](abi-signatures.md) — how function signatures are written
- [Modules & Imports](modules.md) — loading modules and dropping prefixes
