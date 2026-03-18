---
title: "@bytes.len"
---

Return the byte length of a bytes value.

**Returns**: `number`

## Syntax

```evml
@bytes.len(value)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `bytes` | Input value |

## Examples

```evml
# Get byte length
print @bytes.len(0xaabbccdd)
```

<!-- HAND-WRITTEN -->

## See Also

- [@len](len.md) — array length
- [@str.len](str.len.md) — string length
