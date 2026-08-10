---
title: "@lang:reverse"
---

Reverse the order of an array's elements.

**Returns**: `array`

## Syntax

```evml
@lang:reverse(arr)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |

<!-- HAND-WRITTEN -->

## See Also

- [@sort](sort.md) — sort by comparator

## On-chain face (@reverse!)

Reverse the word payload of the array return of a call on-chain through
`reverseWords`. The result is a words payload (bytes), composable with
the other array faces.

### Examples

```evml
load assertions
load lang

set $safe 0x44fA8E6f47987339850636F88629646662444217

assertions:assert @at!($safe::{getOwners()(address[])} -1) == @me
```

### See Also

- `assertions:assert`, `@sort!`, `@map!`
