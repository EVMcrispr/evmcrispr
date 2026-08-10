---
title: "@lang:str.includes"
---

Check whether a string contains a substring (exact byte sequence, case-sensitive).

**On-chain (`@lang:str.includes!`)**: The substring may be a live call; a constant one must be non-empty, since every string contains the empty string.

**Returns**: `bool`

## Syntax

```evml
@lang:str.includes(value item)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `string` | Source string |
| `item` | `string` | Substring to search for |

<!-- HAND-WRITTEN -->

## See Also

- [@str.replace](str.replace.md) — find and replace
- [@includes](includes.md) — array membership check

## On-chain face (@str.includes!)

Whether the string return of a call contains a substring, checked on-chain — exact byte sequence, case-sensitive, no wildcards.

### Examples

```evml
load assertions
load lang

set $pool 0x44fA8E6f47987339850636F88629646662444217

# "Uniswap LP Token" contains "LP"
assertions:assert @str.includes!($pool::{name()(string)} "LP") == true

# The name must NOT mention a rebrand
assertions:assert @str.includes!($pool::{name()(string)} "Sushi") == false
```

### Notes

- An empty `part` is rejected at build time when it is a constant —
  every string contains it, so the assertion could never fail. A LIVE
  part that resolves empty reports found at 0, which is the same answer
  stated honestly rather than a guard that cannot run.
- Matches the exact byte sequence: case-sensitive, no wildcards or regex; a
  multi-byte UTF-8 `part` matches its exact encoding.
- Boolean-valued: usable bare, compared with `== true` / `== false`, or
  nested inside `@bool!(...)` logic.

### See Also

- `assertions:assert`, `@str.charset!`, `@str.split!`
