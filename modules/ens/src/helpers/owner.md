---
title: "@ens:owner"
---

Owner of an ENS name (the real owner when the name is wrapped).

**On-chain (`@ens:owner!`)**: Mainnet only, since an assertion reads the chain it runs on, and an unowned name reads as the zero address rather than an error.

**Returns**: `address`

## Syntax

```evml
@ens:owner(name)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | ENS name (e.g. vitalik.eth) |

## Examples

```evml
# Get the owner of a name
set $owner @ens:owner("vitalik.eth")
print $owner
```

<!-- HAND-WRITTEN -->

## See Also
