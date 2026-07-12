---
title: "@ens:expiry"
---

Registration expiry timestamp of a .eth name.

**Returns**: `number`

## Syntax

```evml
@ens:expiry(name)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | .eth second-level name (e.g. vitalik.eth) |

## Examples

```evml
# Check when a name expires
set $expiry @ens:expiry("vitalik.eth")
print $expiry
```

<!-- HAND-WRITTEN -->

## See Also
