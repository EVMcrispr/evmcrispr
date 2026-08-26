---
title: "gelato:withdraw"
---

Withdraw settled USDC from the Gelato Gas Tank (step 2 of 2, on Polygon). Presents the merkle proof Gelato published after settling your gelato:request-withdrawal; fetched from the 1Balance API, or given with --proof and --total.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
gelato:withdraw <amount> <token>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amount` | `number` | USDC amount (6 decimals) |
| `token` | `token-symbol` | USDC |

<!-- HAND-WRITTEN -->

## Notes

- Withdrawals are two-step: `gelato:request-withdrawal` on-chain, then Gelato settles
  the request off-chain and publishes a merkle proof; `gelato:withdraw` presents it.
  The proof and the settled total are fetched from Gelato's 1Balance API for the
  connected account (contract sponsors such as Safes are looked up as
  `137:<address>`); pass `--proof` and `--total` to reuse values copied from the
  Gelato app instead.
- Not simulable without a proof: in a fork, pass `--proof`/`--total`.


## Examples

```evml
# TODO: add examples
```

## See Also
