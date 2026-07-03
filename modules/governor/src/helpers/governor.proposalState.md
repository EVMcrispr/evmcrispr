---
title: "@governor:governor.proposalState"
---

Current state of a Governor proposal: Pending, Active, Canceled, Defeated, Succeeded, Queued, Expired or Executed.

**Returns**: `string`

## Syntax

```evml
@governor:governor.proposalState(governor, proposalId)
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

print @governor.proposalState($governor $proposalId)
```

## Notes

- Returns the state name: `Pending`, `Active`, `Canceled`, `Defeated`,
  `Succeeded`, `Queued`, `Expired` or `Executed`.

## See Also

- [governor:propose](../commands/propose.md) / [governor:vote](../commands/vote.md)
