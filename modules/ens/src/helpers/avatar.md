---
title: "@ens:avatar"
---

Avatar URI of an ENS name.

**Returns**: `string`

## Syntax

```evml
@ens:avatar(name)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | ENS name (e.g. vitalik.eth) |

## Examples

```evml
# Get the avatar for an ENS name
set $avatar @ens:avatar("vitalik.eth")
print $avatar
```

<!-- HAND-WRITTEN -->

## See Also

- [@ens:name](name.md) — reverse-resolve an address
- [@ens:text](text.md) — read a text record
