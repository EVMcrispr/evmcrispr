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

## On-chain face (@sigValid!)

The digest — EIP-191 for a plain message, EIP-712 for typed-data JSON,
sniffed like the plain face — is computed from the constant message at
composition; only the verification runs at judgement.

- **Signer without code**: the signature (a constant 65-byte ECDSA
  signature) is recovered through the recovery precompile and the result
  compared against the expected signer. A bad signature makes the
  precompile return nothing, which surfaces as a revert the wrapping
  `orElse` turns into `false` — same answer the plain face's catch-all
  gives. A structurally malformed signature folds to constant `false`.
  Valid-looking inputs are deliberately NOT folded to `true`: the
  on-chain recovery is the assertable content.
- **Signer with code**: `isValidSignature(bytes32,bytes)` is staticcalled
  and the returned word compared against the ERC-1271 magic value; a
  reverting handler (Safe-style, for unknown hashes) reads as `false`.
  The signature may be LIVE here — read off a contract and spliced into
  the call — which an EOA signer refuses.
- **EIP-7702**: an account whose code is a delegation designator
  (`0xef0100…`) is verified against its key, not its delegate — the
  plain face verifies the same way.

The plain face only recovers ECDSA signatures, so a contract signer is a
declared divergence: it reads `false` off-chain and verifies on-chain.
ERC-6492 counterfactual signatures verify on neither face.

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
