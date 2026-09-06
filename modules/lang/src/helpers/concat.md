---
title: "@lang:concat"
---

Concatenate arrays together.

**On-chain (`@lang:concat!`)**: Live parts remain unresolved until execution; each input is resolved once when the calldata is assembled.

**Returns**: `array`

## Syntax

```evml
@lang:concat(first ...rest)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `first` | `array` | First array to concatenate |
| `[...rest]` | `array` | Additional arrays to append |

<!-- HAND-WRITTEN -->

## See Also

- [@flat](flat.md) — flatten nested arrays

## On-chain face (@concat!)

Concatenate typed arrays in order. Live arguments are resolved once for ABI construction, without the former four-live-part limit. Array element types must agree.
