---
title: "sim:wait"
---

Advance time and mine blocks in a fork simulation.

## Syntax

```evml
sim:wait <duration> [period]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `duration` | `number` | Simulated time to advance, in seconds |
| `[period]` | `number` | Seconds per block |

## Examples

```evml
# Advance time by 1 hour
sim:fork --using anvil (
  sim:wait 3600
)
```

<!-- HAND-WRITTEN -->

## See Also

- [fork](fork.md) — fork the chain
- [@date](../../../std/src/helpers/date.md) — compute timestamps
