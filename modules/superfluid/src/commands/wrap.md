---
title: "superfluid:wrap"
---

Wrap an underlying token into its SuperToken (DAI to DAIx, native xDAI to xDAIx...), approving the SuperToken automatically when needed. The amount is in the underlying token's base units (e.g. 100e6 for 100 USDC); SuperTokens themselves are always 18 decimals.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
superfluid:wrap <amount> <into> <token>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `amount` | `number` | Runtime in smart blocks | Amount to wrap, in the underlying token's base units |
| `into` | `command` | Build time | Keyword `into` |
| `token` | `supertoken` | Build time | SuperToken symbol (e.g. USDCx) or address |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--no-approve` | `bool` | Build time | Skip the automatic allowance check and approve action |

## Examples

```evml
# Wrap 100 native xDAI into xDAIx on Gnosis (no approval needed)
superfluid:wrap 100e18 into xDAIx

# Wrap 100 USDC (6 decimals) into USDCx — the amount is in the underlying's base units and the approval is inserted automatically
superfluid:wrap 100e6 into USDCx
```

<!-- HAND-WRITTEN -->

## See Also
