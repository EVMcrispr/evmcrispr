---
title: "@ens:name"
---

Reverse-resolve an address to its primary ENS name.

**Returns**: `string`

## Syntax

```evml
@ens:name(address)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `address` | `address` | Address to resolve |

## Examples

```evml
# Reverse-resolve an address to an ENS name
set $name @ens:name(0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045)
print $name
```

<!-- HAND-WRITTEN -->

## See Also

- [@ens:avatar](avatar.md) — get the avatar URI
- [@ens:text](text.md) — read a text record
