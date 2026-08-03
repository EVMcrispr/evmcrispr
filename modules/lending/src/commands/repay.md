---
title: "lending:repay"
---

Repay borrowed tokens, approving the pool automatically when needed. Pass `max` as the amount to clear the debt dust-exact: the approval covers the current debt plus a 0.1% interest buffer, and the pool pulls only what is owed.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
lending:repay <amount> <token>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amount` | `command \| number` | Amount to repay in base units (wei), or the keyword `max` to repay the full debt |
| `token` | `address` | Borrowed token to repay (use @token(SYM)) |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--using` | `lending-adapter` | Lending protocol: AaveV3, Spark or CompoundV3 (default: the best available on the chain) |
| `--on-behalf-of` | `address` | Account whose debt is repaid (defaults to the connected account; not combinable with `max`) |
| `--no-approve` | `bool` | Skip the automatic allowance check and approve action |

## Examples

```evml
# Repay 50 WXDAI of variable-rate debt on Aave v3 (Gnosis)
lending:repay 50e18 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d
```

<!-- HAND-WRITTEN -->

## Repaying `max` with delayed execution

`repay max` reads the current debt when the script builds its actions and
approves that amount plus a 0.1% interest buffer; the pool then pulls only
what is actually owed at execution time. If the actions execute much later
than they are built — for example a Safe proposal waiting days for
signatures — the interest accrued in between can outgrow the buffer and the
repay reverts on the allowance. For long-delayed executions pass an explicit
amount, or pre-approve a larger allowance and use `--no-approve`.

## See Also

- [lending:borrow](borrow.md)
- [@lending:debt](../helpers/debt.md)
