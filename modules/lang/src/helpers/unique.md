---
title: "@lang:unique"
---

Remove duplicates from an array, preserving first-occurrence order. As @unique! an ADJACENT dedup on-chain through uniqueWords — nest @sort! for set-uniqueness: @unique!(@sort!(…)).

**Returns**: `array`

## Syntax

```evml
@lang:unique(arr)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |

<!-- HAND-WRITTEN -->

## See Also

- [@filter](filter.md) — custom duplicate removal

## On-chain face (@unique!)

Deduplicate ADJACENT equal words of the array return of a call on-chain
through `uniqueWords` (O(n)). For set-uniqueness over unsorted input,
nest `@sort!`: `@unique!(@sort!(…))`.

### Examples

```evml
load assertions
load lang

set $safe 0x44fA8E6f47987339850636F88629646662444217

assertions:assert @unique!(@sort!($safe::{getOwners()(address[])})) == 0x1122
```

### See Also

- `assertions:assert`, `@sort!`
