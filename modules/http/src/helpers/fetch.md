---
title: "@http:fetch"
---

Fetch a URL and return the response body as a string.

**Returns**: `string`

## Syntax

```evml
@http:fetch(url method? body? auth?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `url` | `string` | Request URL |
| `[method]` | `string` | HTTP method (`GET`, `POST`, etc.) |
| `[body]` | `string` | Request body (JSON string) |
| `[auth]` | `string` | Authorization header value |

<!-- HAND-WRITTEN -->

## See Also

- [@http:json](json.md) — parse JSON response
- [@http:json.format](json.format.md) — build JSON request body
