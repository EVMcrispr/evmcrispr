---
title: "@lang:str.concat"
---

Concatenate strings together.

**On-chain (`@lang:str.concat!`)**: Live parts remain unresolved until execution; each input is resolved once when the calldata is assembled.

**Returns**: `string`

## Syntax

```evml
@lang:str.concat(first ...rest)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `first` | `string` | First string segment |
| `[...rest]` | `string` | Strings to append |

<!-- HAND-WRITTEN -->

## See Also

- [@str.join](str.join.md) — join array elements with a delimiter
- [@concat](concat.md) — concatenate arrays

## On-chain face (@str.concat!)

Concatenate constant or live string parts in order. Each supplied part is resolved once, then the contract allocates and copies the result. There is no four-live-part limit; gas and calldata size still bound execution. Use `@str.join!` to insert a delimiter.
