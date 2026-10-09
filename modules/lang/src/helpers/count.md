---
title: "@lang:count"
---

Count the elements of an array that satisfy the predicate.

**Returns**: `number`

## Syntax

```evml
@lang:count(arr fn)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |
| `fn` | `helper` | Predicate helper returning bool |

<!-- HAND-WRITTEN -->

## Examples

```evml
load lang [@count]

def @isBig "$n: number -> bool" @bool($n > 2)

# 2
print @count([1 2 3 4] @isBig)
```

## See Also

- [@filter](filter.md): keep the matching elements
- [@any](any.md): true if at least one matches
- [@all](all.md): true if all match
- [@len](len.md): the number of elements

## On-chain face (@count!)

Count the elements for which a named boolean callback returns true. Empty arrays count 0. Callbacks support composed helpers and ABI calls over typed single-word or multiword elements.

### Examples

```evml
load lang

set $vault 0x44fA8E6f47987339850636F88629646662444217
set $token 0x6B175474E89094C44Da98b954EedeAC495271d0F

# At least two caps are 100 or more
def @ge100! "$x: number -> bool" @bool!($x >= 100)
assert @count!($vault::!{caps()(uint256[])} @ge100!) >= 2

# At least three holders have a balance of 1000 or more
def @funded! "$who: address -> bool" @bool!($token::!{balanceOf(address)(uint256) $who} >= 1000)
assert @count!($vault::!{holders()(address[])} @funded!) >= 3
```

### Notes

- Same result as `@len!(@filter!(...))`, without building the filtered array.
- A predicate that compares one call over the element with a value, such as
  a balance against a minimum, costs one call per element. The value may be
  a call of its own: it is read once, not once per element.
