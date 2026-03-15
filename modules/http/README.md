# http module

HTTP and JSON helpers: fetch URLs, parse JSON, and construct JSON strings.

```
load http
```

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@http:fetch](src/helpers/fetch.md) | `string` | Fetch a URL and return the response body as a string. |
| [@http:json](src/helpers/json.md) | `any` | Parse a JSON string and extract a value by path. |
| [@http:json.format](src/helpers/json.format.md) | `string` | Construct a JSON string from a template and an array of values. |

