---
title: "@http:json"
---

Parse a JSON string and extract a value by path.

**Returns**: `any`

## Syntax

```evml
@http:json(data, path)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `data` | `string` | JSON string to parse |
| `path` | `json-path` | JSONPath expression (e.g. `data.items[0].name`) |

## Examples

```evml
# Parse JSON and extract a field
set $data '{"name":"Alice","age":30}'
set $name @json($data "name")
print $name

# Nested path
set $data '{"user":{"name":"Alice"}}'
set $name @json($data "user.name")
print $name

# Array access
set $data '{"items":[10,20,30]}'
set $second @json($data "items[1]")
print $second
```

<!-- HAND-WRITTEN -->

## See Also

- [@http:fetch](fetch.md) — fetch a URL
- [@http:json.format](json.format.md) — build JSON strings
