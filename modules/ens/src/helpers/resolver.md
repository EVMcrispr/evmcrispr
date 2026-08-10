---
title: "@ens:resolver"
---

Resolver contract address of an ENS name.

**Returns**: `address`

## Syntax

```evml
@ens:resolver(name)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | ENS name (e.g. vitalik.eth) |

## Examples

```evml
# Get the resolver of a name
set $resolver @ens:resolver("vitalik.eth")
print $resolver
```

<!-- HAND-WRITTEN -->

## See Also
