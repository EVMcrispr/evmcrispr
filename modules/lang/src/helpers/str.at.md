---
title: "@lang:str.at"
---

Access one UTF-8 byte as a string; reject bytes belonging to multibyte characters.

**On-chain (`@lang:str.at!`)**: Selects one UTF-8 byte; a byte belonging to a multibyte character is rejected.

**Returns**: `string`

## Syntax

```evml
@lang:str.at(value index)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `string` | Source string |
| `index` | `number` | Zero-based byte index (negative counts from the end) |

<!-- HAND-WRITTEN -->

## See Also

- [@str.slice](str.slice.md) — extract a substring
- [@at](at.md) — array element access

## On-chain face (@str.at!)

Both modes select a single UTF-8 byte using a signed byte index. Negative indexes count from the end. Out-of-bounds indexes and bytes belonging to multibyte characters are rejected, since a partial character cannot form a valid string. Use `@str.slice` to select a complete multibyte character, or `@bytes.at` for raw bytes.
