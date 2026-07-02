---
title: "loop"
---

Repeat a block: iterate over an array (`loop $x of $arr`) or until a condition is true (`loop until <condition>`).

## Syntax

```evml
loop [variable] <connector> <value> <block>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[variable]` | `variable` | Loop variable, bound per element (iteration form) |
| `connector` | `command` | Keyword `of` (iterate an array) or `until` (repeat while false) |
| `value` | `expression` | Array to iterate over, or exit condition |
| `block` | `block` | Commands to repeat |

## Examples

```evml
# Iterate over an array
set $items [1 2 3]
loop $item of $items (
  print $item
)

# Repeat until a condition is true
set $i 0
loop until @bool($i >= 3) (
  print $i
  set $i @num($i + 1)
)
```

<!-- HAND-WRITTEN -->

## Notes

- Two forms share one command: `loop $x of $array ( ... )` iterates an array, and `loop until <condition> ( ... )` repeats while the condition is false.
- The until form checks the condition *before* each iteration and stops as soon as it becomes true — an initially-true condition runs zero iterations.
- The loop variable (`$item`, `$i`, ...) is scoped to the block.
- Empty arrays result in zero iterations.
- An until loop that never terminates fails after 10,000 iterations.

## See Also

- [if](if.md) — conditional execution
- [@arr](../helpers/arr.md) — generate a sequence of numbers
- [@bool](../helpers/bool.md) — boolean expressions
