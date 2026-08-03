---
title: "swaps:wrap"
---

Wrap the native token into its canonical wrapped form (ETH to WETH, xDAI to WXDAI...).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
swaps:wrap <amount>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amount` | `number` | Native amount to wrap, in base units (wei) |

## Examples

```evml
# Wrap 1 xDAI into WXDAI (on Gnosis)
swaps:wrap 1e18
```

<!-- HAND-WRITTEN -->

## See Also
