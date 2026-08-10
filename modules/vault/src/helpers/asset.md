---
title: "@vault:asset"
---

Underlying asset token address of an ERC-4626 vault.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `address`

## Syntax

```evml
@vault:asset(vault)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `vault` | `address` | ERC-4626 vault address |

## Examples

```evml
# Print the underlying asset of the sDAI vault
print "sDAI asset:" @vault:asset(0xaf204776c7245bF4147c2612BF6e5972Ee483701)
```

<!-- HAND-WRITTEN -->

## See Also

## On-chain face (@asset!)

Read asset() at assertion time.

#
