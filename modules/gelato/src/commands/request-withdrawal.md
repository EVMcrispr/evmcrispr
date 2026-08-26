---
title: "gelato:request-withdrawal"
---

Ask the Gelato Gas Tank to release USDC back to you (step 1 of 2, on Polygon). Gelato settles requests off-chain; once settled, gelato:withdraw moves the funds and gelato:cancel-withdrawal puts them back into the tank.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
gelato:request-withdrawal <amount> <token>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amount` | `number` | USDC amount (6 decimals) |
| `token` | `token-symbol` | USDC |

## Examples

```evml
# Ask Gelato to release 40 USDC from your Gas Tank
gelato:request-withdrawal 40e6 USDC
```

<!-- HAND-WRITTEN -->

## Notes

- Step 1 of 2: Gelato settles requests off-chain, after which `gelato:withdraw`
  (or `gelato:cancel-withdrawal`) completes them. Requested amounts stop paying for
  executions immediately.


## See Also
