---
title: "@receipts:txs"
experimental: true
sidebar:
  label: "@receipts:txs ⚗️"
---

Most recent transaction hashes sent to or from an address, newest first. Inspect individual entries with @receipts:tx. Needs an explorer API (Etherscan key or a chain with a Blockscout instance) — plain RPC cannot list per-address history.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `array`

## Syntax

```evml
@receipts:txs(address chain? limit?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `address` | `address` | Address to list |
| `[chain]` | `chain` | Chain to look on (default: current chain) |
| `[limit]` | `number` | Maximum number of transactions (default 10, max 50) |

## Examples

```evml
# List the latest transactions of an address
set $latest @receipts:txs(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d gnosis 5)
```

<!-- HAND-WRITTEN -->

Plain RPC cannot list per-address history, so this helper needs an explorer API: an Etherscan key when configured, otherwise the chain's Blockscout instance (keyless). To pass a `limit`, name the chain first — `@receipts:txs(@me gnosis 5)`.

## See Also

- [@receipts:tx](tx.md) — inspect one of the returned hashes
- [@receipts:account](account.md) — inspect the address itself
