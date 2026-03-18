---
title: "for"
---

Iterate over an array, executing a block for each element.

## Syntax

```evml
for <variable> <connector> <array> <block>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `variable` | `variable` | Variable name |
| `connector` | `string` | Keyword `of` |
| `array` | `any` | Array to iterate over |
| `block` | `block` | Commands to execute per element |

## Examples

```evml
# Iterate over a range
for $i of @arr(0 3) (
  print $i
)

# Process items
set $items [1 2 3]
for $item of $items (
  print $item
)
```

<!-- HAND-WRITTEN -->

## Notes

- The loop variable (`$addr`, `$i`, etc.) is scoped to the block
- The connector keyword is `of`
- Empty arrays result in zero iterations

## See Also

- [while](while.md) — condition-based loop
- [@arr](../helpers/arr.md) — generate a sequence of numbers
