---
title: "@lang:str.replace"
---

Replace all occurrences of a substring (every non-overlapping left-to-right match).

**On-chain (`@lang:str.replace!`)**: The substring to match must be non-empty.

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
load assertions
load lang

set $pool 0x44fA8E6f47987339850636F88629646662444217

assertions:assert @str.replace!($pool::{name()(string)} "LP" "Pool") == "Curve Pool Token"
```

### Notes

- The needle must be non-empty (EmptyNeedle on-chain).
- Byte-exact and case-sensitive; matches are scanned left to right
  without overlap, exactly like `indexOf`'s scan.

### See Also

- `assertions:assert`, `@str.split!`, `@str.includes!`
