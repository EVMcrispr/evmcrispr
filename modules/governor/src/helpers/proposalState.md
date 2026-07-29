---
title: "@governor:proposalState"
---

Current state of a Governor proposal: Pending, Active, Canceled, Defeated, Succeeded, Queued, Expired or Executed.

**Returns**: `string`

## Syntax

```evml
@governor:proposalState(governor proposalId)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `governor` | `address` | Governor address |
| `proposalId` | `number` | Proposal id |

<!-- HAND-WRITTEN -->

## Examples

```evml
load governor

set $governor 0x44fA8E6f47987339850636F88629646662444217
set $proposalId 42

print @governor:proposalState($governor $proposalId)
```

## Notes

- Returns the state name: `Pending`, `Active`, `Canceled`, `Defeated`,
  `Succeeded`, `Queued`, `Expired` or `Executed`.

## See Also

- [governor:propose](../commands/propose.md) / [governor:vote](../commands/vote.md)
