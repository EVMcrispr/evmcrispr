---
title: "@lang:includes"
---

Check whether an array contains an element.

**On-chain (`@lang:includes!`)**: The element may be constant or live. Generic arrays compare canonical ABI values, preserving dynamic tuple and array boundaries.

**Returns**: `bool`

## Syntax

```evml
@lang:includes(value item)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `array` | Source array |
| `item` | `any` | Element to search for |

<!-- HAND-WRITTEN -->

## See Also

- [@find](find.md) — find the first matching element
- [@filter](filter.md) — keep all matching elements

## On-chain face (@includes!)

Test membership of a typed array, supporting single-word and multiword elements. Generic values use equality of their canonical ABI encodings. Search stops at the first match. Use `@str.includes!` for substring membership.
