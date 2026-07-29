---
title: "@explorer:tx.status"
experimental: true
sidebar:
  label: "@explorer:tx.status ⚗️"
---

Whether a transaction succeeded: true on success, false when it reverted. Errors while the transaction is still pending.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `bool`

## Syntax

```evml
@explorer:tx.status(hash chain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `hash` | `bytes32` | Transaction hash |
| `[chain]` | `chain` | Chain to look on (default: current chain) |

## Examples

```evml
# Check that a transaction succeeded
set $ok @explorer:tx.status(0x16df2e878e23ff261844fc9252f6c8bfcd4cb69f9f80895c6a2f01032b228e13)
```

<!-- HAND-WRITTEN -->

## See Also

- [@explorer:tx.gasUsed](tx.gasUsed.md) — gas used by a transaction
- [@explorer:tx](tx.md) — full transaction summary
