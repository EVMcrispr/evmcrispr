---
title: "@bytes.concat"
---

Concatenate bytes values together.

**Returns**: `bytes`

## Syntax

```evml
@bytes.concat(first, ...rest)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `first` | `bytes` |  |
| `[...rest]` | `bytes` | Bytes values to append |

## Examples

```evml
# Concatenate bytes
set $c @bytes.concat(0xaa 0xbb)
```

<!-- HAND-WRITTEN -->

## See Also

- [@concat](concat.md) — concatenate arrays
- [@str.concat](str.concat.md) — concatenate strings
