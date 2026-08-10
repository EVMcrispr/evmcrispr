---
title: "@lang:str.lower"
---

Convert a string to lowercase.

**On-chain (`@lang:str.lower!`)**: Maps ASCII letters only; every other byte passes through unchanged.

**Returns**: `string`

## Syntax

```evml
@lang:str.lower(s)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `s` | `string` | Source string |

<!-- HAND-WRITTEN -->

## See Also

- [@str.upper](str.upper.md) — convert to uppercase

## On-chain face (@str.lower!)

Lowercase the string return of a call on-chain through `toLower`:
ASCII letters only, every other byte passes verbatim (UTF-8 safe).

### Examples

```evml
load assertions
load lang

set $pool 0x44fA8E6f47987339850636F88629646662444217

assertions:assert @str.lower!($pool::{symbol()(string)}) == "weth"
```

### See Also

- `assertions:assert`, `@str.upper!`
