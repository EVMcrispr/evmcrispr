---
title: "@semaphore:verify"
---

Check a Semaphore membership proof against a group with the contract's view verifier: no transaction and no nullifier recording.

**On-chain (`@semaphore:verify!`)**: The proof and group id are taken as constants; validity is judged against the group's state when the assertion runs, so a root rotation flips the answer.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `bool`

## Syntax

```evml
@semaphore:verify(proof group)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `proof` | `string` | Proof JSON from semaphore:prove |
| `group` | `number` | Group id |

<!-- HAND-WRITTEN -->

## On-chain face (@semaphore:verify!)

The proof JSON and group id are taken as composition-time constants — the
proof tuple is all value types, so the whole verification is one flat
literal staticcall to the singleton's view `verifyProof`. What the face
buys over the plain one is WHEN it answers: validity is judged against the
group's state at assertion time, so a root rotation between composition
and judgement flips the answer. A group that does not exist reverts the
judge on both faces.

## See Also

- [semaphore:validate](../commands/validate.md) — the transactional counterpart
