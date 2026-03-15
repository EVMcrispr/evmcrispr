# for

Iterate over an array, executing a block for each element.

## Syntax

```
for <variable> <connector> <array> <block>
```

## Arguments

| Name | Type | Required |
|------|------|----------|
| variable | `variable` | Yes |
| connector | `string` | Yes |
| array | `any` | Yes |
| block | `block` | Yes |

<!-- HAND-WRITTEN -->









## Examples

```
# Approve multiple addresses
set $addresses [0x64c0...a84e 0x8790...2F15]
for $addr of $addresses (
  exec @token(DAI) "approve(address,uint256)" $addr 100e18
)

# Iterate over a range
for $i of @range(0 5) (
  print $i
)

# Process items
set $items [1 2 3]
for $item of $items (
  print "Item:" $item
)
```

## Notes

- The loop variable (`$addr`, `$i`, etc.) is scoped to the block
- The connector keyword is `of`
- Empty arrays result in zero iterations

## See Also

- [while](while.md) — condition-based loop
- [@range](../helpers/range.md) — generate a sequence of numbers
- [@map](../helpers/map.md) — transform arrays functionally
