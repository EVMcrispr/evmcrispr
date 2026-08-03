---
title: "@circom:field.rand"
---

Generate a uniformly random BN254 field element (rejection-sampled, no modulo bias) — for secrets, trapdoors and commitment salts.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@circom:field.rand
```

## Examples

```evml
# Random secret and its Poseidon commitment
set $secret @circom:field.rand()
print "Commitment:" @circom:poseidon($secret)
```

<!-- HAND-WRITTEN -->

## Notes

- Uses rejection sampling over `crypto.getRandomValues`, so values are uniform over the field (no modulo bias).
- Each evaluation produces a fresh value — bind it with `set` if you need to reuse it.

## See Also

- [@circom:poseidon](poseidon.md) — commit to the generated secret
