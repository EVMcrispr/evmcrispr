---
title: "@semaphore:root"
---

The current Merkle root of a Semaphore group's member tree.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@semaphore:root(group)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `group` | `number` | Group id |

<!-- HAND-WRITTEN -->

## On-chain face (@semaphore:root!)

One staticcall to the singleton's `getMerkleTreeRoot`, on the chain the
assertion runs on. The group id may itself be a live `::` call or a nested
`!` face. A chain with no known deployment refuses during composition
(`set $semaphore:address` / `set $semaphore:deployBlock` point at one),
and a group that does not exist reads 0 on both faces.

## See Also

- [@semaphore:members](members.md)
