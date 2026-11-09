---
title: "eez:faucet"
---

Send devnet ETH to an account from a pre-funded key set in $eez:faucetKey, so a fresh wallet can pay for gas on a devnet that has one (a local enclave). The faucet signs the transfer itself; nothing is asked of the connected wallet. The hosted ChiadoX testnet has no such key: its rollup is funded by bridging.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: cannot be nested. This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.

## Syntax

```evml
eez:faucet [recipient]
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `[recipient]` | `address` | Build time | Account to fund (defaults to the connected account) |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--amount` | `number` | Build time | Amount to send in wei (default 0.1 ETH, enough for many transactions) |

## Examples

```evml
# Top up the connected wallet from the key set in $eez:faucetKey
eez:faucet @me --amount 1e12
```

<!-- HAND-WRITTEN -->

## See Also
