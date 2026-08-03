---
title: "semaphore:validate"
---

Validate a Semaphore membership proof on-chain. The contract records the nullifier, so a second proof with the same identity and scope reverts.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
semaphore:validate <proof> <for> <group>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `proof` | `string` | Proof JSON from semaphore:prove |
| `for` | `command` | Keyword `for` |
| `group` | `number` | Group id |

<!-- HAND-WRITTEN -->

## Notes

- `validateProof` records the nullifier on-chain: a second proof from the
  same identity and scope reverts. Use
  [@semaphore:verify](../helpers/verify.md) for a read-only check that
  records nothing.

## See Also

- [semaphore:prove](prove.md)
