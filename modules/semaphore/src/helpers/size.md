---
title: "@semaphore:size"
---

The number of leaves in a Semaphore group's member tree (removed members keep their slot as 0).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@semaphore:size(group)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `group` | `number` | Group id |

<!-- HAND-WRITTEN -->

## On-chain face (@semaphore:size!)

One staticcall to the singleton's `getMerkleTreeSize`, on the chain the
assertion runs on. The group id may itself be a live `::` call or a nested
`!` face. A chain with no known deployment refuses during composition
(`set $semaphore:address` / `set $semaphore:deployBlock` point at one),
and a group that does not exist reads 0 on both faces.

## Notes

- Removed members keep their slot (as 0), so size never shrinks.
