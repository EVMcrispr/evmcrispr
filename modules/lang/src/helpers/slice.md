---
title: "@lang:slice"
---

Extract a section of an array.

**Returns**: `array`

## Syntax

```evml
@lang:slice(value start end?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `array` | Source array |
| `start` | `number` | Start index (inclusive; negative counts from the end) |
| `[end]` | `number` | End index (exclusive; negative counts from the end; omitted = to the end) |

<!-- HAND-WRITTEN -->

## See Also

- [@at](at.md) — access a single element
- [@len](len.md) — array length

## On-chain face (@slice!)

The elements [start, end) of the array return of a call, sliced
on-chain out of the live words payload (the @str.slice! recipe scaled
to words): constant indices scale by 32 into byte offsets at
composition time, and negative bounds compile to
`sub(byteLen(payload), 32k)` — the payload's byte length IS the live
length word in byte units, so from-the-end bounds resolve live at
assertion time.

The result is a words payload (a bytes value), composable with the
other array faces: `@len!(@slice!(…))`, `@at!(@slice!(…) 0)`,
`@sort!(@slice!(…))`, `@includes!(@slice!(…) x)`.

### Examples

```evml
load assertions
load lang

set $safe 0x44fA8E6f47987339850636F88629646662444217

# Elements [1, 3)
assertions:assert @slice!($safe::{getOwners()(address[])} 1 3) == 0x1122

# The last two elements, resolved against the live length
assertions:assert @len!(@slice!($safe::{getOwners()(address[])} -2)) == 2
```

### Notes

- Arrays of single-word elements only (nested array faces work too:
  `@slice!(@sort!(…) 0 3)`).
- An empty or inverted range reverts at assertion time — on-chain
  slicing has no silent clamp (constant inverted ranges are rejected at
  build time).

### See Also

- `assertions:assert`, `@at!`, `@len!`, `@sort!`
