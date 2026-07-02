---
title: "@enumerate"
---

Return an array of [index, element] pairs.

**Returns**: `array`

## Syntax

```evml
@enumerate(arr)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |

## Examples

```evml
# Enumerate array elements
set $items ["a" "b" "c"]
set $pairs @enumerate($items)
```

<!-- HAND-WRITTEN -->

## See Also

- [loop](../../commands/loop.md) — iterate over arrays
- [@zip](zip.md) — combine two arrays into pairs
