---
title: "@sigValid"
---

Verify a signature against an expected signer address. Auto-detects EIP-712 typed data (JSON) vs. plain message.

**Returns**: `bool`

## Syntax

```evml
@sigValid(address data signature)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `address` | `address` | Expected signer address |
| `data` | `string` | Plain-text message, or EIP-712 typed data JSON string (matching what was signed). |
| `signature` | `bytes` | Hex-encoded signature to verify |

## Examples

```evml
# Verify a personal-message signature against the signer
set $ok @sigValid(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 "hello" 0xf16ea9a3478698f695fd1401bfe27e9e4a7e8e3da94aa72b021125e31fa899cc573c48ea3fe1d4ab61a9db10c19032026e3ed2dbccba5a178235ac27f94504311c)
print $ok
```

<!-- HAND-WRITTEN -->

## Behaviour

If `data` parses as JSON with the EIP-712 shape (`types`, `primaryType`, `message`),
the signature is verified with `verifyTypedData`. Otherwise `data` is treated as a
plain personal-message and verified with `verifyMessage`. Returns `"false"` for
malformed signatures rather than throwing, so it can safely drive `if` / `switch`.

## More examples

```evml
# Round-trip: verify a message I just signed
sign $sig "hello world"
if @sigValid(@me "hello world" $sig) (
  print "signature ok"
)

# Round-trip an EIP-712 typed-data signature
set $payload '{"types":{"Mail":[{"name":"to","type":"address"}]},"primaryType":"Mail","domain":{"name":"App"},"message":{"to":"0x1234567890abcdef1234567890abcdef12345678"}}'
sign $sig --typed $payload
set $ok @sigValid(@me $payload $sig)
print $ok
```

## See Also

- [sign](../commands/sign.md) — produce a signature with the connected wallet
- [if](../commands/if.md) — branch on a boolean
