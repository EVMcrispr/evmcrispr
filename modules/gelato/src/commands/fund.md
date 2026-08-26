---
title: "gelato:fund"
---

Deposit USDC into the Gelato Gas Tank (1Balance) that pays for Automate, Web3 Function and VRF executions on every chain. Deposits happen on Polygon only; `for <sponsor>` credits another account (a DAO, a Safe) instead of yours. Approves the exact amount first when the allowance falls short.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
gelato:fund <amount> <token> [for] [sponsor]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amount` | `number` | USDC amount (6 decimals) |
| `token` | `token-symbol` | USDC |
| `[for]` | `command` | Keyword `for` |
| `[sponsor]` | `address` | Account to credit (defaults to the connected account) |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--no-approve` | `bool` | Skip the allowance check and approval |

## Examples

```evml
# Top up your Gas Tank with 100 USDC (on Polygon)
gelato:fund 100e6 USDC

# Fund the Gas Tank of a DAO that creates the tasks
gelato:fund 250e6 USDC for 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71
```

<!-- HAND-WRITTEN -->

## Notes

- The Gas Tank (Gelato 1Balance) lives on Polygon and takes native USDC
  (`0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`) only; one balance pays for tasks on
  every chain. Bridge USDC over first when needed (see the `bridges` module).
- The sponsor is whoever creates the tasks: fund `for <dao>` when a DAO or Safe is
  the task creator.
- Check what is left with `@gelato:balance`; the live figure, fees deducted, is in
  the Gelato app.


## See Also
