---
title: "@circom:eddsa.pub"
---

Derive the EdDSA public key (a Baby Jubjub point, as an [x y] pair) from a secret — the circom-ecosystem signature scheme used by Semaphore and MACI identities. The secret is sensitive: anything bound to a variable can be printed.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `array`

## Syntax

```evml
@circom:eddsa.pub(secret)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `secret` | `string` | Secret seed (any non-empty string or hex value) |

## Examples

```evml
# Derive an identity public key from a secret
set [$x $y] @circom:eddsa.pub("my secret seed")
print "Pubkey:" $x $y
```

<!-- HAND-WRITTEN -->

## Notes

- EdDSA over Baby Jubjub with Poseidon hashing — the signature scheme circom circuits verify natively (circomlib `EdDSAPoseidonVerifier`), used by Semaphore and MACI identities.
- **The secret is sensitive.** Anything bound to an EVML variable can be printed or shared with a script; derive secrets from throwaway seeds when prototyping, and let protocol modules handle real identity custody.

## See Also

- [@circom:eddsa.sign](eddsa.sign.md) / [@circom:eddsa.verify](eddsa.verify.md)
