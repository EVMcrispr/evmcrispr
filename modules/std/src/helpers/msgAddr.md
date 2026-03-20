---
title: "@msgAddr"
---

Recover the signer address from a message and its signature.

**Returns**: `address`

## Syntax

```evml
@msgAddr(message, signature)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `message` | `string` | The original message that was signed |
| `signature` | `bytes` | The hex-encoded signature |

## Examples

```evml
# Recover signer from a signed message
set $signer @msgAddr("${message}" ${signature})
print $signer
```

<!-- HAND-WRITTEN -->

## See Also

- [@me](me.md) — get the connected wallet address
