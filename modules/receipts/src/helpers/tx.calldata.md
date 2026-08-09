---
title: "@receipts:tx.calldata"
experimental: true
sidebar:
  label: "@receipts:tx.calldata ⚗️"
---

Full input data of a transaction, including the 4-byte selector. Replay it with `exec <target> <calldata>` or decode it with @abi.decodeCall.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `bytes`

## Syntax

```evml
@receipts:tx.calldata(hash chain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `hash` | `bytes32` | Transaction hash |
| `[chain]` | `chain` | Chain to look on (default: current chain) |

## Examples

```evml
# Read the calldata of a transaction
set $data @receipts:tx.calldata(0x16df2e878e23ff261844fc9252f6c8bfcd4cb69f9f80895c6a2f01032b228e13)
```

<!-- HAND-WRITTEN -->

Replay a past call by passing the calldata straight to `exec`, or decode it with [@abi.decodeCall](../../../std/src/helpers/abi.decodeCall.md).

## See Also

- [@receipts:tx](tx.md) — full transaction summary
- [@abi.decodeCall](../../../std/src/helpers/abi.decodeCall.md) — decode calldata into signature and args
