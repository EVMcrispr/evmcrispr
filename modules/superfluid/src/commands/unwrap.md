---
title: "superfluid:unwrap"
---

Unwrap a SuperToken back to its underlying token (DAIx to DAI, xDAIx to native xDAI...). The amount is in the SuperToken's 18-decimal base units; pass `max` to unwrap the full balance. Keep some balance if streams are still running — unwrapping below the buffer makes them liquidatable.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
superfluid:unwrap <amount> <of> <token>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amount` | `command \| number` | SuperToken amount to unwrap in base units (18 decimals), or the keyword `max` for the full balance |
| `of` | `command` | Keyword `of` |
| `token` | `supertoken` | SuperToken symbol (e.g. USDCx) or address |

## Examples

```evml
# Unwrap 50 xDAIx back to native xDAI
superfluid:unwrap 50e18 of xDAIx

# Wrap and later exit completely with `max`, previewed inside a fork simulation
load sim

sim:fork --using anvil (
  sim:set-balance @me 200e18
  superfluid:wrap 100e18 into xDAIx
  superfluid:unwrap max of xDAIx
)
```

<!-- HAND-WRITTEN -->

## See Also
