# if

Conditionally execute a block of commands, with an optional else block.

## Syntax

```
if <condition> <thenBlock> [elseBlock]
```

## Arguments

| Name | Type | Required |
|------|------|----------|
| condition | `bool` | Yes |
| thenBlock | `block` | Yes |
| elseBlock | `block` | No |

<!-- HAND-WRITTEN -->









## Examples

```
# Simple condition
if true (
  exec @token(DAI) "approve(address,uint256)" @me 100e18
)

# Boolean expression
if @bool(1 == 1) (
  print "equal"
)

# Variable condition
set $flag true
if $flag (
  print "flag is true"
)

# Compound conditions
set $a 10
set $b 5
if @bool($a > 0 and $b < 100) (
  print "both conditions met"
)

# If-else
if @bool($balance > 0) (
  print "has balance"
) (
  print "no balance"
)
```

## See Also

- [@bool](../helpers/bool.md) — boolean expressions
