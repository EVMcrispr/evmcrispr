---
title: "@semaphore:nullifier"
---

The nullifier a stored identity produces for a scope (poseidon of the hashed scope and the identity secret) — what the contract records on validateProof; useful to check whether a signal was already sent.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@semaphore:nullifier(scope commitment?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `scope` | `any` | Scope (external nullifier) |
| `[commitment]` | `number` | Identity commitment (default: the only identity of this session) |

<!-- HAND-WRITTEN -->

## Notes

- This is the value `validateProof` records: check it against past events
  to know whether an identity already signaled in a scope. The contract
  exposes no nullifier getter.

## See Also

- [semaphore:validate](../commands/validate.md)
