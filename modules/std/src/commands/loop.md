---
title: "loop"
---

Repeat a block: iterate over an array (`loop $x of $arr`), repeat until a condition is true (`loop until <condition>`), or exit/skip an iteration from inside the block (`loop break`, `loop continue`).

## Syntax

```evml
loop [variable] <connector> [value] [block]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[variable]` | `variable` | Loop variable, bound per element (iteration form) |
| `connector` | `command` | Keyword `of` (iterate an array), `until` (repeat while false), `break` or `continue` (inside a loop block) |
| `[value]` | `expression` | Array to iterate over, or exit condition |
| `[block]` | `block` | Commands to repeat |

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

# Exit a loop early with loop break
loop $i of @arr(0 10) (
  if @bool($i >= 3) (
    loop break
  )
  print $i
)

# Skip to the next iteration with loop continue
loop $i of [1 2 3 4] (
  if @bool($i == 2 or $i == 4) (
    loop continue
  )
  print $i
)
```

<!-- HAND-WRITTEN -->

## Notes

- Two forms share one command: `loop $x of $array ( ... )` iterates an array, and `loop until <condition> ( ... )` repeats while the condition is false.
- The until form checks the condition *before* each iteration and stops as soon as it becomes true — an initially-true condition runs zero iterations.
- The loop variable (`$item`, `$i`, ...) is scoped to the block.
- Empty arrays result in zero iterations.
- An until loop that never terminates fails after 10,000 iterations.

## break and continue

Inside a loop block, `loop break` exits the nearest enclosing loop and `loop continue` skips to the next iteration. Both are typically used as guards:

```evml
set $items [1 0 200 3]
loop $item of $items (
  if @bool($item == 0) (
    loop continue
  )
  if @bool($item > 100) (
    loop break
  )
  print $item
)
```

- They only work inside a loop block; a `def` command body is a boundary — a `loop break` inside a def body cannot break a loop at the call site.
- Use [`def return`](def.md) to leave a command body, or [`exit`](exit.md) to stop the whole script.

## See Also

- [if](if.md) — conditional execution
- [exit](exit.md) — stop the whole script
- [@arr](../helpers/arr.md) — generate a sequence of numbers
- [@bool](../helpers/bool.md) — boolean expressions
