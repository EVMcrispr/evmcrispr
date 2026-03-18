---
title: "def"
---

Define a user command or helper.

## Syntax

```evml
def <params>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `params` | `string` | Definition expression (see syntax variants below) |

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
```
## Notes

- The type signature string defines parameter names, types, and return type
- Parameters are prefixed with `$`, optional params wrapped in `[]`
- Helpers defined inside blocks (e.g. `if`) are scoped to that block
- Type inference: if the return type is omitted, it is inferred from the body

## See Also

- [set](set.md) — assign values to variables
