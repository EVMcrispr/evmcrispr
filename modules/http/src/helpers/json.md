---
title: "@http:json"
---

Parse a JSON string and extract a value by path.

**Returns**: `any`

## Syntax

```evml
@http:json(data path)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `data` | `string` | JSON string to parse |
| `path` | `json-path` | JSONPath expression (e.g. `data.items[0].name`) |

<!-- HAND-WRITTEN -->

## See Also

- [@http:fetch](fetch.md) — fetch a URL
- [@http:json.format](json.format.md) — build JSON strings
