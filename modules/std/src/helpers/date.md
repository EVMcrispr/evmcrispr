---
title: "@date"
---

Parse a date string into a Unix timestamp, with an optional offset.

**Returns**: `number`

## Syntax

```evml
@date(date, offset?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `date` | `string` | ISO 8601 date string or `now` |
| `[offset]` | `string` | Time offset (e.g. `+1d`, `-2h`, `+3mo`) |

## Examples

```evml
# Parse an ISO date to Unix timestamp
set $ts @date(2025-01-01)

# Current timestamp
set $now @date(now)

# With positive offset
set $future @date(2025-01-01 +1d)

# With negative offset
set $yesterday @date(2025-01-01 -1d)
```

<!-- HAND-WRITTEN -->

## See Also

- [wait](../commands/wait.md) — wait between actions (advances time in simulations)
