---
title: "@circom:eddsa.verify"
---

Verify an EdDSA (Baby Jubjub, Poseidon variant) signature: the [R8x R8y S] array from @circom:eddsa.sign against a message and an [x y] public key.

**Returns**: `bool`

## Syntax

```evml
@circom:eddsa.verify(message signature pubkey)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `message` | `number` | Field-element message that was signed |
| `signature` | `array` | Signature as [R8x R8y S] |
| `pubkey` | `array` | Public key as [x y] (from @circom:eddsa.pub) |

<!-- HAND-WRITTEN -->

## See Also

- [@circom:eddsa.sign](eddsa.sign.md) — produces the `[R8x R8y S]` signature
- [@circom:eddsa.pub](eddsa.pub.md) — derives the `[x y]` public key
