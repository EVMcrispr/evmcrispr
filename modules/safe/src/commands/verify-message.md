---
title: "safe:verify-message"
---

Compute the EIP-712 hashes of an off-chain Safe message (plain string or typed-data JSON) so signers can verify what their wallet displays.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
safe:verify-message <safe> <message>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `safe` | `address` | Safe address |
| `message` | `string` | Raw message string, or an EIP-712 typed-data JSON document |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--as` | `variable` | Bind the JSON verification report |
| `--format` | `string` | auto (text or typed data) or bytes (exact hex bytes for nested signatures) |
| `--offline` | `bool` | Compute the report without RPC; chain-dependent checks remain unchecked |

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

## Nested Safe owners

`--as $review` binds the same report shape as transaction verification.
Extract `package` for merging or `typedData` for the generic `sign` command.
`--offline true` skips chain-dependent checks entirely.

For a Safe that owns another Safe, use the parent's exact `signingBytes`:

```evml novalidate
load http
safe:verify-message $ownerSafe @http:json($parentReview signingBytes) --format bytes --offline true --as $messageReview
sign $signature --typed @http:json($messageReview typedData)
set $signedMessage @safe:merge(@http:json($messageReview package) $signature)
set $signedTransaction @safe:merge($tx $signedMessage)
```

Do not substitute the parent's final hash or its hex text for `signingBytes`.
The default `--format auto` preserves text/typed-data message hashing.
An exported message package can also be passed directly for inspection.

## See Also

- [safe:verify](verify.md)
- [@safe:messageHash](../helpers/messageHash.md)
