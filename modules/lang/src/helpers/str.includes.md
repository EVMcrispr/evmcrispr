---
title: "@lang:str.includes"
---

Check whether a string contains a substring. As @str.includes! the string return of a call is checked on-chain — exact byte sequence, case-sensitive, no wildcards.

**Returns**: `bool`

## Syntax

```evml
@lang:str.includes(value item)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `string` | Input value (in @str.includes! a `::` call expression or chain returning a string) |
| `item` | `string` | Substring to search for (non-empty in @str.includes!) |

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

- Matches the exact byte sequence: case-sensitive, no wildcards or regex; a
  multi-byte UTF-8 `part` matches its exact encoding.
- An empty `part` is rejected at build time — every string contains it, so
  the assertion could never fail.
- Boolean-valued: usable bare, compared with `== true` / `== false`, or
  nested inside `@bool!(...)` logic.

### See Also

- `assertions:assert`, `@str.charset!`, `@str.split!`
