---
title: "@semaphore:depth"
---

The current depth of a Semaphore group's member tree.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@semaphore:depth(group)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `group` | `number` | Group id |

<!-- HAND-WRITTEN -->

## On-chain face (@semaphore:depth!)

One staticcall to the singleton's `getMerkleTreeDepth`, on the chain the
assertion runs on. The group id may itself be a live `::` call or a nested
`!` face, in which case its word is spliced into the calldata at judgement.
A chain with no known deployment refuses during composition (point at one
with `set $semaphore:address` / `set $semaphore:deployBlock`), and a group
that does not exist reads 0 on both faces.

## See Also

- [@semaphore:root](root.md)
