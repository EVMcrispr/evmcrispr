---
title: "wait"
---

Wait for a duration before executing the next action (fork simulations advance the chain's clock instead).

## Syntax

```evml
wait <duration>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `duration` | `number` | Time to wait, in seconds |

<!-- HAND-WRITTEN -->

## Examples

```evml
# Wait a minute between two transactions
set $contract 0x44fA8E6f47987339850636F88629646662444217
exec $contract start()
wait 60
exec $contract finish()
```

```evml
# Inside a fork simulation the wait is instant: the chain's clock is warped
load sim
sim:fork (
  wait 86400
)
```

## Notes

- In live execution the client really waits (the script pauses between
  transactions); in `sim:fork` blocks the fork's timestamp is advanced
  instead, so timelocks and vesting cliffs can be crossed instantly.

## See Also
