---
title: "@ens:cointype"
---

ENSIP-11 coin type of an EVM chain, for multichain address records.

**Returns**: `number`

## Syntax

```evml
@ens:cointype(chain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[chain]` | `chain` | Chain name or id (e.g. optimism, 10); defaults to the connected chain |

## Examples

```evml
# Coin type for an L2 address record
set $ct @ens:cointype(optimism)
print $ct
```

<!-- HAND-WRITTEN -->

## See Also
