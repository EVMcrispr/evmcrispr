---
title: "@ens:ens.owner"
---

Get the owner of an ENS name (the real owner when the name is wrapped).

**Returns**: `address`

## Syntax

```evml
@ens:ens.owner(name)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | ENS name (e.g. vitalik.eth) |

## Examples

```evml
# Get the owner of a name
set $owner @ens.owner("vitalik.eth")
print $owner
```

<!-- HAND-WRITTEN -->

## See Also
