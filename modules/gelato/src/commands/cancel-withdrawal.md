---
title: "gelato:cancel-withdrawal"
---

Put a settled withdrawal request back into the Gelato Gas Tank instead of withdrawing it (on Polygon). Needs the same merkle proof as gelato:withdraw — fetched from the 1Balance API, or given with --proof and --total.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
gelato:cancel-withdrawal <amount> <token>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amount` | `number` | USDC amount (6 decimals) |
| `token` | `token-symbol` | USDC |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--proof` | `array` | Merkle proof copied from app.gelato.cloud, e.g. [0x… 0x…] (skips the 1Balance API lookup) |
| `--total` | `number` | totalValidRequestedWithdrawAmount that goes with --proof |

<!-- HAND-WRITTEN -->

## Notes

- Same proof as `gelato:withdraw`; use it to keep funds in the tank after a
  settled request you no longer want to take out.


## Examples

```evml
# TODO: add examples
```

## See Also
