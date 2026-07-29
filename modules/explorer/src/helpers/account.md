---
title: "@explorer:account"
experimental: true
sidebar:
  label: "@explorer:account ⚗️"
---

Human-readable summary of an address: EOA / contract / EIP-7702-delegated EOA, verified contract name, proxy implementation, ENS name, balance and tx count.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `string`

## Syntax

```evml
@explorer:account(address chain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `address` | `address` | Address to inspect |
| `[chain]` | `chain` | Chain to look on (default: current chain) |

## Examples

```evml
# Inspect what an address is
print @explorer:account(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d)
```

<!-- HAND-WRITTEN -->

For proxies the verified name and compiler shown are the implementation's — the proxy shell itself carries no useful information. Verification metadata comes from Etherscan when an API key is configured, falling back to the chain's Blockscout instance.

## See Also

- [@explorer:txs](txs.md) — recent transactions of an address
- [@contracts:codeAt](../../../contracts/src/helpers/codeAt.md) — raw deployed bytecode
