---
title: "@safe:signature"
---

Packed owner signatures of a Safe transaction or Safe message once enough owners have signed, e.g. the EIP-1271 signature a dapp asks for.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `bytes`

## Syntax

```evml
@safe:signature(safe target message:<value>)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `safe` | `address` | Safe address |
| `target` | `bytes32 \| string` | Safe transaction or Safe message JSON, a safeTxHash, or a safeMessageHash with message:true |
| `message:` | `bool` | `message:true` — the hash is a safeMessageHash |

<!-- HAND-WRITTEN -->

Reads the current owners, threshold and on-chain confirmations, and returns
the owners' signatures packed in ascending owner order — the bytes a Safe's
EIP-1271 `isValidSignature` accepts. It fails until enough owners have
signed. For a queued message, pass `message:true` with its safeMessageHash;
the confirmations are fetched from the Safe Transaction Service and checked
against the hash.

## Examples

```evml novalidate
safe:propose-offline $msg $mySafe "I agree to the terms"
safe:confirm-offline $msg $mySafe $msg
print @safe:signature($mySafe $msg)
```

```evml novalidate
print @safe:signature($mySafe 0x2c9c1f8f2a816f9ffe3ee902e08c02e01e9060e353fa892ee7d1cf27454935cb message:true)
```
