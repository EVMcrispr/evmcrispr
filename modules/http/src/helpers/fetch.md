---
title: "@http:fetch"
---

Fetch a URL and return the response body as a string.

**Returns**: `string`

## Syntax

```evml
@http:fetch(url, method?, body?, auth?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `url` | `string` |  |
| `[method]` | `string` | HTTP method (`GET`, `POST`, etc.) |
| `[body]` | `string` | Request body (JSON string) |
| `[auth]` | `string` | Authorization header value |

## Examples

```evml
# Simple GET request
set $response @fetch("https://test.evmcrispr.local/hello")
print $response

# POST with a body
set $response @fetch("https://test.evmcrispr.local/echo" POST "payload")
print $response
```

<!-- HAND-WRITTEN -->

## See Also

- [@http:json](json.md) — parse JSON response
- [@http:json.format](json.format.md) — build JSON request body
