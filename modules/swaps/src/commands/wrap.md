---
title: "swaps:wrap"
---

Wrap the native token into its canonical wrapped form (ETH to WETH, xDAI to WXDAI...).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
swaps:wrap <amount>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `amount` | `number` | Runtime in smart blocks | Native amount to wrap, in base units (wei) |

## Examples

```evml
# Wrap 1 xDAI into WXDAI (on Gnosis)
swaps:wrap 1e18
```

<!-- HAND-WRITTEN -->

## See Also
