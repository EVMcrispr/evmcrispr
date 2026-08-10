---
title: "@ens:coinType.decode"
---

Chain name of an ENSIP-11 coin type (the inverse of @ens:coinType).

**Returns**: `string`

## Syntax

```evml
@ens:coinType.decode(coinType)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `coinType` | `number` | ENSIP-11 coin type (e.g. 60, 2147483658) |

## Examples

```evml
# Find out which chain a coin type belongs to
set $chain @ens:coinType.decode(2147483658)
print $chain
```

<!-- HAND-WRITTEN -->

## See Also
