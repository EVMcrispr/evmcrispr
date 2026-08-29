---
title: "eez:faucet"
---

Send devnet ETH to an account from the EEZ devnet's pre-funded faucet key, so a fresh wallet can pay for gas. The faucet signs the transfer itself; nothing is asked of the connected wallet.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
eez:faucet [recipient]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[recipient]` | `address` | Account to fund (defaults to the connected account) |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--amount` | `number` | Amount to send in wei (default 0.1 ETH, enough for many transactions) |

## Examples

```evml
# Give the connected wallet some devnet ETH for gas
switch eezL1
eez:faucet @me
```

<!-- HAND-WRITTEN -->

## See Also
