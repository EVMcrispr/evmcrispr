---
title: "@ens:expiry"
---

Registration expiry timestamp of a .eth name.

**On-chain (`@ens:expiry!`)**: Mainnet only, since an assertion reads the chain it runs on, and an unregistered name reads as 0 rather than erroring.

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
