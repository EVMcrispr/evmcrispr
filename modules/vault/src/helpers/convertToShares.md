---
title: "@vault:convertToShares"
---

Amount of shares an ERC-4626 vault would mint for a given amount of underlying assets, in base units of the share token. As @convertToShares! the conversion is read on-chain at assertion time — the assets argument may itself be a live call.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@vault:convertToShares(vault assets)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `vault` | `address` | ERC-4626 vault address |
| `assets` | `number` | Asset amount, in base units (wei) |

## Examples

```evml
# Print how many sDAI shares 100 WXDAI buys
print "Shares:" @vault:convertToShares(0xaf204776c7245bF4147c2612BF6e5972Ee483701 100e18)
```

<!-- HAND-WRITTEN -->

## See Also

## On-chain face (@convertToShares!)

Read convertToShares(assets) at assertion time. A literal amount
compiles to plain calldata; a live `::` call folds into a core read
splice.

#
