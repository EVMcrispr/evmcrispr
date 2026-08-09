---
title: "@governor:proposalId"
---

Proposal id of a Governor proposal, derived from its targets, values, calldatas and description. Prefer the optional variable of governor:propose when creating the proposal in the same script. As @proposalId! the id is read on-chain at assertion time through orElse(getProposalId, hashProposal) — whichever derivation the governor exposes wins.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

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

## On-chain face (@proposalId!)

Read the proposal id at assertion time through the core's orElse:
getProposalId(...) on modern governors, hashProposal(...) where only
the older derivation exists — whichever resolves wins. The proposal
components still encode (and the description still hashes) at
composition time.

### Examples

```evml
load assertions
load governor

set $governor 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2

assertions:assert @proposalId!($governor [$target] [0] [$calldata] "do the thing") != 0
```
