# def

Define a user command or helper.

## Syntax

```
def <params>
```

## Arguments

| Name | Type | Required |
|------|------|----------|
| params | `string` | Yes |

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

## Examples

```
# Constant helper — returns a fixed address
def @myAddr "address" 0x44fA8E6f47987339850636F88629646662444217
set $result @myAddr

# Helper with typed parameters
def @double "$n: number -> number" @num($n * 2)
set $result @double(5)  # 10

# Helper with optional parameter
def @addOpt "$a: number [$b: number] -> number" @num($a + $b)
set $result @addOpt(3 7)  # 10

# Boolean helper
def @isPositive "$n: number -> bool" @bool($n > 0)

# Command definition
def my-approve "$addr: address $amount: number" (
  exec @token(DAI) "approve(address,uint256)" $addr $amount
)
my-approve 0x44fA...4217 100e18

# No-argument command
def approve-self "" (
  exec @token(DAI) "approve(address,uint256)" @me 1e18
)
approve-self

# Higher-order: pass helpers as arguments
def @double "$n: number -> number" @num($n * 2)
set $items [1 2 3]
set $result @map($items @double)  # [2 4 6]

# Composition
def @double "$n: number -> number" @num($n * 2)
def @quadruple "$n: number -> number" @double(@double($n))
set $result @quadruple(3)  # 12
```

## Notes

- The type signature string defines parameter names, types, and return type
- Parameters are prefixed with `$`, optional params wrapped in `[]`
- Helpers defined inside blocks (e.g. `if`) are scoped to that block
- Type inference: if the return type is omitted, it is inferred from the body

## See Also

- [set](set.md) — assign values to variables
