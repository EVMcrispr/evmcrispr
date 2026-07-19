---
title: "def"
---

Define a user command, helper, or module (`def module <name> ( ...defs )`).

## Syntax

```evml
def <name> <params> <body>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `command \| helper` |  |
| `params` | `string` | Definition expression (see syntax variants below) |
| `body` | `expression \| block` |  |

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
```
## Notes

- The type signature string defines parameter names, types, and return type
- Parameters are prefixed with `$`, optional params wrapped in `[]`
- Helpers defined inside blocks (e.g. `if`) are scoped to that block
- Type inference: if the return type is omitted, it is inferred from the body

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
