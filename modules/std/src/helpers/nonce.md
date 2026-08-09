---
title: "@nonce"
---

Number of transactions sent from an address (its account nonce), read over plain RPC. For contracts the nonce counts the CREATEs they performed. Off-chain only: the EVM has no nonce opcode, so no on-chain form exists.

**Returns**: `number`

## Syntax

```evml
@nonce(address)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `address` | `address` | Account address |

## Examples

```evml
# Get the nonce of an address
set $n @nonce(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266)
print $n
```

<!-- HAND-WRITTEN -->

## See Also

- [@me](me.md) — get the connected wallet address
