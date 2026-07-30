---
title: "@zk:field.rand"
---

Generate a uniformly random BN254 field element (rejection-sampled, no modulo bias) — for secrets, trapdoors and commitment salts.

**Returns**: `number`

## Syntax

```evml
@zk:field.rand
```

## Examples

```evml
# Random secret and its Poseidon commitment
set $secret @zk:field.rand()
print "Commitment:" @zk:poseidon($secret)
```

<!-- HAND-WRITTEN -->

## Notes

- Uses rejection sampling over `crypto.getRandomValues`, so values are uniform over the field (no modulo bias).
- Each evaluation produces a fresh value — bind it with `set` if you need to reuse it.

## See Also

- [@zk:poseidon](poseidon.md) — commit to the generated secret
