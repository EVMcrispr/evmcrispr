---
title: "superfluid:vest"
---

Vest a total SuperToken amount to a receiver over a duration through the VestingScheduler (V3), executed by Superfluid's keeper network. With --cliff, everything accrued up to the cliff is transferred at once when it passes, then the rest streams. Automatically grants the scheduler flow-operator rights and the SuperToken allowance it needs; execution is permissionless but not guaranteed if the grants are revoked.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
superfluid:vest <amount> <token> <to> <receiver> <over> <duration>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `amount` | `number` | Runtime in smart blocks | Total amount to vest, in base units (18 decimals) |
| `token` | `supertoken` | Build time | SuperToken symbol (e.g. USDCx) or address |
| `to` | `command` | Build time | Keyword `to` |
| `receiver` | `address` | Runtime in smart blocks | Vesting receiver |
| `over` | `command` | Build time | Keyword `over` |
| `duration` | `number` | Build time | Total vesting duration, e.g. 1y or 730d |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--start` | `number` | Runtime in smart blocks | Unix timestamp at which vesting starts (defaults to now) |
| `--cliff` | `number` | Build time | Cliff period from the start (e.g. 90d): nothing until it passes, then the accrued amount at once |
| `--claimable-for` | `number` | Build time | Make the schedule claimable: the receiver must claim within this period after the start or it never begins |
| `--no-approve` | `bool` | Build time | Skip the automatic permission grant and allowance actions |

## Examples

```evml
# Vest 12,000 xDAIx to a contributor over a year with a 3-month cliff (scheduler permissions and allowance are granted automatically)
superfluid:vest 12000e18 xDAIx to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 over 1y --cliff 90d
```

<!-- HAND-WRITTEN -->

## See Also
