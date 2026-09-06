---
title: "@lang:unique"
---

Remove duplicates from an array, preserving first-occurrence order.

**On-chain (`@lang:unique!`)**: Removes all duplicates while preserving first-occurrence order.

**Returns**: `array`

## Syntax

```evml
@lang:unique(arr equal?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |
| `[equal]` | `helper` | Equality predicate for generic values |

<!-- HAND-WRITTEN -->

## See Also

- [@filter](filter.md) — custom duplicate removal

## On-chain face (@unique!)

Deduplicate ADJACENT equal words of the array return of a call on-chain
through `uniqueWords` (O(n)). For set-uniqueness over unsorted input,
nest `@sort!`: `@unique!(@sort!(…))`.

### Examples

```evml
load lang

set $safe 0x44fA8E6f47987339850636F88629646662444217

assert @unique!(@sort!($safe::{getOwners()(address[])})) == 0x1122
```

### See Also

- `assert`, `@sort!`
