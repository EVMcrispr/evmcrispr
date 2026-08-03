---
title: "@semaphore:members"
---

The ordered member commitments of a Semaphore group, reconstructed from contract events and checked against the on-chain root. Removed members appear as 0.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `array`

## Syntax

```evml
@semaphore:members(group)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `group` | `number` | Group id |

<!-- HAND-WRITTEN -->

## Notes

- Reconstructed from contract events (chunked scans from the deployment
  block, cached incrementally per session) and always cross-checked
  against the on-chain root — a mismatch throws rather than returning a
  wrong set.
- Removed members appear as 0 at their original index.

## See Also

- [@semaphore:root](root.md)
