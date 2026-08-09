---
title: "@receipts:tx.count"
experimental: true
sidebar:
  label: "@receipts:tx.count ⚗️"
---

Number of transactions sent from an address (its account nonce), read over plain RPC. For contracts the nonce counts the CREATEs they performed. Off-chain only: the EVM has no nonce opcode, so no on-chain form exists.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@receipts:tx.count(address chain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `address` | `address` | Address to read |
| `[chain]` | `chain` | Chain to look on (default: current chain) |

## Examples

```evml
# Read the nonce of an account
set $nonce @receipts:tx.count(0xCED608Aa29bB92185D9b6340Adcbfa263DAe075b)
```

<!-- HAND-WRITTEN -->

## See Also

- [@receipts:txs](txs.md) — recent transactions of an address
- [@receipts:tx](tx.md) — full transaction summary

