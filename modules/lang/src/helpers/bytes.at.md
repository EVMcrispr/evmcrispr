---
title: "@bytes.at"
---

Access a single byte by index in a bytes value.

**Returns**: `bytes`

## Syntax

```evml
@bytes.at(value, index)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `bytes` | Input value |
| `index` | `number` | Zero-based byte index |

## Examples

```evml
# Get byte at index
set $first @bytes.at(0xaabbcc 0)
```

<!-- HAND-WRITTEN -->

## See Also

- [@bytes.slice](bytes.slice.md) — extract a byte range
- [@at](at.md) — array element access
