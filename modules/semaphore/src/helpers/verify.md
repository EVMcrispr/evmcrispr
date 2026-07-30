---
title: "@semaphore:verify"
---

Check a Semaphore membership proof against a group with the contract's view verifier — no transaction and no nullifier recording.

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

## See Also

- [semaphore:validate](../commands/validate.md) — the transactional counterpart
