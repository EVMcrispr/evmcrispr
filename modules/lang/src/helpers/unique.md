---
title: "@lang:unique"
---

Remove duplicates from an array, preserving first-occurrence order.

**On-chain (`@lang:unique!`)**: Uses canonical ABI equality by default, or a custom equality predicate, preserving first-occurrence order.

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

Keep the first occurrence of each value, preserving input order. Word arrays use
`uniqueWords` with `ordered = false`. Strings, bytes, tuples, and nested arrays use
`uniqueValues` with canonical ABI equality by default: the complete value must
match, including every tuple field and nested element. An optional named boolean
predicate overrides equality. Neither path requires sorted input.

Inputs may be homogeneous literals, live fixed-size or dynamic arrays, or nested
on-chain collection helpers. An untyped empty literal defaults to `uint256[]`.
Generic duplicate removal performs up to O(n²) comparisons, so keep live arrays
bounded when transaction gas matters.

### Examples

```evml
load lang

set $safe 0x44fA8E6f47987339850636F88629646662444217

assert @unique!(@sort!($safe::{getOwners()(address[])})) == 0x1122

# Strings need no explicit equality callback.
assert @len!(@unique!(["alice" "bob" "alice"])) == 2
```

### See Also

- `assert`, `@sort!`
