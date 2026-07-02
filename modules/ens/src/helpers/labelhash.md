---
title: "@ens:labelhash"
---

Compute the ENS labelhash of a single label.

**Returns**: `bytes32`

## Syntax

```evml
@ens:labelhash(label)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `label` | `string` | Single ENS label (e.g. `vitalik`, no dots) |

## Examples

```evml
# Hash a single ENS label
set $label @labelhash("vitalik")
```

<!-- HAND-WRITTEN -->

## See Also
