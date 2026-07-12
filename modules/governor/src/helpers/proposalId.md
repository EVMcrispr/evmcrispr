---
title: "@governor:proposalId"
---

Proposal id of a Governor proposal, derived from its targets, values, calldatas and description. Prefer the optional variable of governor:propose when creating the proposal in the same script.

**Returns**: `number`

## Syntax

```evml
@governor:proposalId(governor targets values calldatas description)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `governor` | `address` | Governor address |
| `targets` | `array` | Target addresses |
| `values` | `array` | ETH values in wei |
| `calldatas` | `array` | Encoded calldata bytes |
| `description` | `string` | Proposal description |

<!-- HAND-WRITTEN -->

## Examples

```evml
load governor

set $governor 0x44fA8E6f47987339850636F88629646662444217
set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb

set $id @governor:proposalId($governor [$token] [0]
  [0xa9059cbb0000000000000000000000004f2083f5fbede34c2714affb3105539775f7fe640000000000000000000000000000000000000000000000056bc75e2d63100000]
  "Fund the grants program")
print @governor:proposalState($governor $id)
```

## Notes

- Prefer the optional variable of [governor:propose](../commands/propose.md) when
  the proposal is created in the same script — it derives the id from the
  action block automatically.
- Reads getProposalId (v5.3+, correct for sequential-id governors), falling
  back to hashProposal, falling back to the standard local hash.

## See Also

- [governor:propose](../commands/propose.md) / [@governor:proposalState](proposalState.md)
