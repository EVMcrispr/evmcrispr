---
title: "@lang:bytes.concat"
---

Concatenate bytes values together.

**On-chain (`@lang:bytes.concat!`)**: Live parts remain unresolved until execution; each input is resolved once when the calldata is assembled.

**Returns**: `bytes`

## Syntax

```evml
@lang:bytes.concat(first ...rest)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `first` | `bytes` | First bytes value |
| `[...rest]` | `bytes` | Bytes values to append |

<!-- HAND-WRITTEN -->

## See Also

- [@concat](concat.md) — concatenate arrays
- [@str.concat](str.concat.md) — concatenate strings

## On-chain face (@bytes.concat!)

Concatenate constant or live byte parts in order. Each supplied part is resolved once. The resolver builds the complete ABI arguments without the former four-live-part limit.
