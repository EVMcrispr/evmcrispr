---
title: "@zk:eddsa.pub"
---

Derive the EdDSA public key (a Baby Jubjub point, as an [x y] pair) from a secret — the circom-ecosystem signature scheme used by Semaphore and MACI identities. The secret is sensitive: anything bound to a variable can be printed.

**Returns**: `array`

## Syntax

```evml
@zk:eddsa.pub(secret)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `secret` | `string` | Secret seed (any non-empty string or hex value) |

## Examples

```evml
# Derive an identity public key from a secret
set [$x $y] @zk:eddsa.pub("my secret seed")
print "Pubkey:" $x $y
```

<!-- HAND-WRITTEN -->

## Notes

- EdDSA over Baby Jubjub with Poseidon hashing — the signature scheme circom circuits verify natively (circomlib `EdDSAPoseidonVerifier`), used by Semaphore and MACI identities.
- **The secret is sensitive.** Anything bound to an EVML variable can be printed or shared with a script; derive secrets from throwaway seeds when prototyping, and let protocol modules handle real identity custody.

## See Also

- [@zk:eddsa.sign](eddsa.sign.md) / [@zk:eddsa.verify](eddsa.verify.md)
