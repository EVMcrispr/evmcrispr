---
title: "semaphore:remove-member"
---

Remove an identity commitment from a Semaphore group (the leaf becomes 0; the tree keeps its size). Computes the required Merkle siblings from the reconstructed member set — they go stale if the group changes before execution.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
semaphore:remove-member <commitment> <from> <group>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `commitment` | `number` | Identity commitment to remove |
| `from` | `command` | Keyword `from` |
| `group` | `number` | Group id |

<!-- HAND-WRITTEN -->

## Notes

- Removal sets the member's leaf to 0 — the tree keeps its size, and the
  member index stays occupied.
- The Merkle siblings are computed from the reconstructed member set at
  planning time; they go stale if the group changes before the
  transaction executes.

## See Also

- [semaphore:add-member](add-member.md)
