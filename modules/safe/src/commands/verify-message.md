---
title: "safe:verify-message"
---

Compute the EIP-712 hashes of an off-chain Safe message (plain string or typed-data JSON) so signers can verify what their wallet displays.

## Syntax

```evml
safe:verify-message <safe> <message>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `safe` | `address` | Safe address |
| `message` | `string` | Raw message string, or an EIP-712 typed-data JSON document |

<!-- HAND-WRITTEN -->

Off-chain Safe messages (EIP-1271 signatures collected through the Safe UI,
e.g. OpenSea listings) are wrapped in a `SafeMessage(bytes)` EIP-712 struct
before owners sign them. This command prints the raw message hash, the Safe's
domain hash, the SafeMessage struct hash and the final SafeMessage hash so
signers can compare them with their wallet display. Plain strings are hashed
per EIP-191; a JSON document with `types` and `message` fields is hashed as
EIP-712 typed data. Only Safe >=1.3.0 is supported.

## Examples

Verify a plain string message:

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
safe:verify-message $mySafe "I agree to the terms"
```

## See Also

- [safe:verify](verify.md)
- [@safe:messageHash](../helpers/messageHash.md)
