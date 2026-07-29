---
title: "@nonce"
---

Get the transaction count (nonce) of an address.

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
