---
title: "@governor:proposalState"
---

Current state of a Governor proposal: Pending, Active, Canceled, Defeated, Succeeded, Queued, Expired or Executed. As @proposalState! the state(id) read happens on-chain at assertion time as the RAW uint8 enum value (0 Pending, 1 Active, 2 Canceled, 3 Defeated, 4 Succeeded, 5 Queued, 6 Expired, 7 Executed) — the string mapping stays off-chain.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

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

## On-chain face (@proposalState!)

Read state(proposalId) at assertion time as the RAW uint8 enum value:
0 Pending, 1 Active, 2 Canceled, 3 Defeated, 4 Succeeded, 5 Queued,
6 Expired, 7 Executed. The string mapping of the plain face stays
off-chain — compare against the numeric value.

### Examples

```evml
load assertions
load governor

set $governor 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2

# Succeeded = 4
assertions:assert @proposalState!($governor $proposalId) == 4 "proposal not succeeded"
```
