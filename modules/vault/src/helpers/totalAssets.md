---
title: "@vault:totalAssets"
---

Total amount of underlying assets managed by an ERC-4626 vault, in base units of the asset.

**Returns**: `number`

## Syntax

```evml
@vault:totalAssets(vault)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `vault` | `address` | ERC-4626 vault address |

## Examples

```evml
# Print the total WXDAI managed by the sDAI vault
print "sDAI TVL:" @vault:totalAssets(0xaf204776c7245bF4147c2612BF6e5972Ee483701)
```

<!-- HAND-WRITTEN -->

## See Also
