---
title: "lending:set-emode"
---

Set the connected account's efficiency-mode category, unlocking higher LTV between correlated assets (e.g. stablecoins). Category 0 disables e-mode.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
lending:set-emode <categoryId>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `categoryId` | `number` | Runtime in smart blocks | E-mode category id (0 disables e-mode) |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--using` | `lending-adapter` | Build time | Lending protocol: AaveV3, Spark or CompoundV3 (default: the best available on the chain) |

## Examples

```evml
# Enter e-mode category 1 to unlock higher LTV between correlated assets
lending:set-emode 1

# Leave e-mode
lending:set-emode 0
```

<!-- HAND-WRITTEN -->

## See Also
