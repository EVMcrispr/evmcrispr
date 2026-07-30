---
title: "@zk:eddsa.sign"
---

Sign a field-element message with EdDSA over Baby Jubjub (Poseidon variant), returning the signature as [R8x R8y S] — destructure or pass whole to @zk:eddsa.verify or into circuit inputs.

**Returns**: `array`

## Syntax

```evml
@zk:eddsa.sign(secret message)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `secret` | `string` | Secret seed the signing key derives from |
| `message` | `number` | Field-element message to sign (hash larger data first) |

## Examples

```evml
# Sign a field element and verify the signature
set $msg @zk:field(@hash("vote for 42"))
set $sig @zk:eddsa.sign("my secret seed" $msg)
set $pub @zk:eddsa.pub("my secret seed")
print "Valid:" @zk:eddsa.verify($msg $sig $pub)
```

<!-- HAND-WRITTEN -->

## Notes

- The message must be a single field element — hash larger data first (e.g. `@zk:field(@hash("..."))` or `@zk:field.hash(...)`).
- Signatures verify off-chain with [@zk:eddsa.verify](eddsa.verify.md) and inside circuits with circomlib's `EdDSAPoseidonVerifier`.

## See Also

- [@zk:eddsa.pub](eddsa.pub.md) — the matching public key
