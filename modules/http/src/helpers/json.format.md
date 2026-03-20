---
title: "@http:json.format"
---

Construct a JSON string from a template and an array of values.

**Returns**: `string`

## Syntax

```evml
@http:json.format(template, values)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `template` | `string` | Brace-wrapped template listing JSON object keys |
| `values` | `array` | Values to substitute into template |

## Examples

```evml
# Build a JSON object from values
set $body @json.format("{name, age}" ["Alice" 30])
print $body
```

<!-- HAND-WRITTEN -->

## See Also

- [@http:json](json.md) — parse JSON strings
- [@http:fetch](fetch.md) — fetch a URL
