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

Concatenate typed arrays in order. Live arguments are resolved once each by the core (`gather`) before the concatenation reads them, so any number of parts may be live. Array element types must agree.
