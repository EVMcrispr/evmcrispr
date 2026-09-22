---
title: "semaphore:validate"
---

Validate a Semaphore membership proof on-chain. The contract records the nullifier, so a second proof with the same identity and scope reverts.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
semaphore:validate <proof> <for> <group>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `proof` | `string` | Build time | Proof JSON from semaphore:prove |
| `for` | `command` | Build time | Keyword `for` |
| `group` | `number` | Runtime in smart blocks | Group id |

<!-- HAND-WRITTEN -->

## Notes

- `validateProof` records the nullifier on-chain: a second proof from the
  same identity and scope reverts. Use
  [@semaphore:verify](../helpers/verify.md) for a read-only check that
  records nothing.

## See Also

- [semaphore:prove](prove.md)
