---
title: "@vault:convertToAssets"
---

Amount of underlying assets an ERC-4626 vault would return for a given amount of shares, in base units of the asset.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@vault:convertToAssets(vault shares)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `vault` | `address` | ERC-4626 vault address |
| `shares` | `number` | Share amount, in base units (wei) |

## Examples

```evml
# Print the WXDAI value of one sDAI share
print "Share price:" @vault:convertToAssets(0xaf204776c7245bF4147c2612BF6e5972Ee483701 1e18)
```

<!-- HAND-WRITTEN -->

## See Also
