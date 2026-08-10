---
title: "@lang:includes"
---

Check whether an array contains an element.

**On-chain (`@lang:includes!`)**: The element searched for must be a build-time constant.

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

Scan the array return of a call for a word, on-chain: a `foldWords` over
the array's word payload with an `eq(item, element)` lambda and the Any
exit, so the fold stops at the first match.

### Examples

```evml
load assertions
load lang

set $safe 0x44fA8E6f47987339850636F88629646662444217

assertions:assert @includes!($safe::{getOwners()(address[])} @me) "not an owner"
```

### Notes

- Arrays of single-word elements only (uintN/intN, address, bool,
  bytes32). For substring search in strings use `@str.includes!`.
- The item is a build-time constant word; a live item would need a
  second read inside the fold template, which templates cannot carry.

### See Also

- `assertions:assert`, `@str.includes!`, `@any!`
