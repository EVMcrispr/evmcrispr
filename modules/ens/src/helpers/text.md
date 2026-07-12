---
title: "@ens:text"
---

Read a text record from an ENS name.

**Returns**: `string`

## Syntax

```evml
@ens:text(name key)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | ENS name (e.g. vitalik.eth) |
| `key` | `string` | Text record key (e.g. "url", "com.twitter", "description") |

## Examples

```evml
# Read a URL text record
set $url @ens:text("vitalik.eth" "url")
print $url

# Read a Twitter handle
set $twitter @ens:text("vitalik.eth" "com.twitter")
print $twitter
```

<!-- HAND-WRITTEN -->

## See Also

- [@ens:name](name.md) — reverse-resolve an address
- [@ens:avatar](avatar.md) — get the avatar URI
