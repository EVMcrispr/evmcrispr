---
title: "@ens:rentPrice"
---

Total price in wei to register or renew a .eth name for a duration.

**Returns**: `number`

## Syntax

```evml
@ens:rentPrice(name duration)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | .eth name or label (e.g. vitalik.eth or vitalik) |
| `duration` | `number` | Duration in seconds |

## Examples

```evml
# Price of one year of registration
set $price @ens:rentPrice("mydao.eth" 31536000)
print $price
```

<!-- HAND-WRITTEN -->

## See Also
