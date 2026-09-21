---
title: "@http:fetch"
---

Fetch an HTTP(S) URL or return explicitly supplied stdin: text.

**Returns**: `string`

## Syntax

```evml
@http:fetch(url method? body? auth?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `url` | `string` | HTTP(S) URL, or stdin: for host-supplied input |
| `[method]` | `string` | HTTP method (`GET`, `POST`, etc.) |
| `[body]` | `string` | Request body (JSON string) |
| `[auth]` | `string` | Authorization header value |

<!-- HAND-WRITTEN -->

## Standard input

```evml
load http [@fetch]
set $data @fetch(stdin:)
print $data
```

```sh
cat input.json | evmcrispr run script.evml > output.json
```

`stdin:` returns the exact UTF-8 text supplied by the host, without trimming.
Repeated reads return the same text. Empty input is valid; missing input is an
error. Method, body, and auth arguments are unavailable for `stdin:`.

In the terminal, supply URL-encoded text with `?stdin=`, for example
`https://evmcrispr.com/#/script-id?stdin=hello%20world`. The hash-route query
wins over a query before the hash. `?stdin=` supplies an empty string; an
absent parameter supplies no input. The value is text, not a URL to fetch.
Encode JSON with `URLSearchParams` or `encodeURIComponent`.

You can also use **Choose input file** before running to replace URL input. Its contents stay
in memory, available for execution and simulation; nothing is uploaded. Use
**Download output** to save printed text. Scripts cannot open a file chooser,
read filesystem paths, or fetch `file:` URLs. Other fetch sources must be
absolute HTTP(S) URLs.

`evmcrispr run -` reads the script itself from stdin and cannot simultaneously
supply data input. Programmatic hosts pass `evml.with({ stdin: text })`.


## See Also

- [@http:json](json.md) — parse JSON response
- [@http:json.format](json.format.md) — build JSON request body
