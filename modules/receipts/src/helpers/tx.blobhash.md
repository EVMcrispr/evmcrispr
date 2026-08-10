---
title: "@receipts:tx.blobhash!"
---

Versioned hash of a blob carried by the executing transaction, or 0 when the index is out of range.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `bytes32`

## Syntax

```evml
@receipts:tx.blobhash!(...index)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[...index]` | `number` | Blob index: a constant or an infix expression |

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions
load receipts

# The batch only executes as part of a blob-carrying transaction
assertions:assert @tx.blobhash!(0) != 0x0000000000000000000000000000000000000000000000000000000000000000 "no blob attached"
```

## See Also

- [@receipts:block.hash!](block.hash.md) — the hash of a recent block
