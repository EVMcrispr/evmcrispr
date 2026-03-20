---
title: "@ens:ens.avatar"
---

Get the avatar URI for an ENS name.

**Returns**: `string`

## Syntax

```evml
@ens:ens.avatar(name)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | ENS name (e.g. vitalik.eth) |

## Examples

```evml
# Get the avatar for an ENS name
set $avatar @ens.avatar("vitalik.eth")
print $avatar
```

<!-- HAND-WRITTEN -->

## See Also

- [@ens.name](ens.name.md) — reverse-resolve an address
- [@ens.text](ens.text.md) — read a text record
