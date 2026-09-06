---
title: "@lang:str.join"
---

Join array elements into a string with a delimiter.

**On-chain (`@lang:str.join!`)**: Array elements must be strings or bytes; literal arrays support live parts. The delimiter may be constant or live.

**Returns**: `string`

## Syntax

```evml
@lang:str.join(arr delim)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |
| `delim` | `string` | Delimiter string |

<!-- HAND-WRITTEN -->

## See Also

- [@str.split](str.split.md) — split a string into an array
- [@str.concat](str.concat.md) — concatenate strings

## On-chain face (@str.join!)

Join string or byte array elements with a constant or live delimiter. The delimiter occurs only between elements. Empty arrays produce an empty string; empty elements are preserved. Runtime arrays can come from calls or typed collection helpers, and literal arrays can contain any number of live parts subject to gas limits. Elements are not implicitly converted from numbers.
