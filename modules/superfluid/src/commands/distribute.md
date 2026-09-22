---
title: "superfluid:distribute"
---

Distribute a SuperToken amount instantly to all members of a GDA pool, pro-rata to their units. The actual amount may round down slightly so every unit receives the same integer share.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
superfluid:distribute <amount> <token> <to> <pool>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `amount` | `number` | Runtime in smart blocks | Amount to distribute, in base units (18 decimals) |
| `token` | `supertoken` | Runtime in smart blocks | SuperToken symbol (e.g. USDCx) or address |
| `to` | `command` | Build time | Keyword `to` |
| `pool` | `address` | Runtime in smart blocks | GDA pool address |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--from` | `address` | Runtime in smart blocks | Distributor account (defaults to the connected account; pools only accept third-party distributors when created with --open-distribution) |

## Examples

```evml
# Distribute 400 xDAIx instantly to all pool members, pro-rata to units
superfluid:create-pool $rewards xDAIx
superfluid:set-units 1 to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 in $rewards
superfluid:distribute 400e18 xDAIx to $rewards
```

<!-- HAND-WRITTEN -->

## See Also
