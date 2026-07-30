---
title: "@semaphore:size"
---

The number of leaves in a Semaphore group's member tree (removed members keep their slot as 0).

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

## Notes

- Removed members keep their slot (as 0), so size never shrinks.
