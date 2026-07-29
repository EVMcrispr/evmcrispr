---
title: "sign"
---

Sign a message or typed data with the connected wallet.

## Syntax

```evml
sign <variable> [message]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `variable` | `variable` | Variable name |
| `[message]` | `string` | Plain-text message to sign |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--typed` | `string` | EIP-712 typed data JSON string |

<!-- HAND-WRITTEN -->

## Examples

```
# Sign a plain-text message
sign $sig "hello world"

# Sign typed data (EIP-712)
sign $sig --typed '{"types":{"Mail":[{"name":"to","type":"address"}]},"primaryType":"Mail","message":{"to":"0x1234..."}}'

# Store and print the signature
sign $sig "approve this action"
print $sig
```

## See Also

- [exec](exec.md) — call a contract function
