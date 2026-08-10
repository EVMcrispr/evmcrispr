---
title: "@lang:str.replace"
---

Replace all occurrences of a substring (every non-overlapping left-to-right match).

**On-chain (`@lang:str.replace!`)**: The needle and replacement may be live calls; a constant needle must be non-empty, and an empty live one reverts.

**Returns**: `string`

## Syntax

```evml
@lang:str.replace(s old replacement)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `s` | `string` | Source string |
| `old` | `string` | Substring to match |
| `replacement` | `string` | Replacement text |

<!-- HAND-WRITTEN -->

## See Also

- [@str.includes](str.includes.md) — check for substring
- [@str.split](str.split.md) — split by delimiter

## On-chain face (@str.replace!)

Rewrite the string return of a call on-chain through `replace`: every
non-overlapping left-to-right match of the exact byte sequence is
replaced.

### Examples

```evml
load lang

set $pool 0x44fA8E6f47987339850636F88629646662444217

assert @str.replace!($pool::{name()(string)} "LP" "Pool") == "Curve Pool Token"
```

### Notes

- A constant needle must be non-empty; a live one that resolves empty
  reverts on-chain with EmptyNeedle, so it fails loudly either way.
- The needle must be non-empty (EmptyNeedle on-chain).
- Byte-exact and case-sensitive; matches are scanned left to right
  without overlap, exactly like `indexOf`'s scan.

### See Also

- `assert`, `@str.split!`, `@str.includes!`
