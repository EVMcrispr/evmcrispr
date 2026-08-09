---
title: "@lang:str.upper"
---

Convert a string to uppercase. As @str.upper! the string return of a call is case-mapped on-chain — ASCII letters only, every other byte passes verbatim (UTF-8 safe).

**Returns**: `string`

## Syntax

```evml
@lang:str.upper(s)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `s` | `string` | Source string (in @str.upper! a `::` call expression or chain returning a string) |

<!-- HAND-WRITTEN -->

## See Also

- [@str.lower](str.lower.md) — convert to lowercase

## On-chain face (@str.upper!)

Uppercase the string return of a call on-chain through `toUpper`:
ASCII letters only, every other byte passes verbatim (UTF-8 safe).

### Examples

```evml
load assertions
load lang

set $pool 0x44fA8E6f47987339850636F88629646662444217

assertions:assert @str.upper!($pool::{symbol()(string)}) == "WETH"
```

### See Also

- `assertions:assert`, `@str.lower!`
