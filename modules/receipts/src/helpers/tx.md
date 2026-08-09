---
title: "@receipts:tx"
experimental: true
sidebar:
  label: "@receipts:tx ⚗️"
---

Human-readable summary of a transaction: status, labeled from/to, value, decoded function call, gas, fee and decoded logs. Use the @receipts:tx.* field helpers for machine-readable values.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `string`

## Syntax

```evml
@receipts:tx(hash chain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `hash` | `bytes32` | Transaction hash |
| `[chain]` | `chain` | Chain to look on (default: current chain) |

## Examples

```evml
# Print a human-readable transaction summary
print @receipts:tx(0x16df2e878e23ff261844fc9252f6c8bfcd4cb69f9f80895c6a2f01032b228e13)
```

<!-- HAND-WRITTEN -->

Verified contract names, ENS labels and decoded calldata/logs are best-effort: when a contract is unverified or a lookup fails, the summary degrades to raw selectors and addresses instead of failing.

## See Also

- [@receipts:tx.calldata](tx.calldata.md) — raw input data of a transaction
- [@receipts:tx.status](tx.status.md) — whether a transaction succeeded
- [@contracts:account](../../../contracts/src/helpers/account.md) — inspect an address
- [@bridges:status](../../../bridges/src/helpers/status.md) — progress of a bridge transfer
