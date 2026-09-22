---
title: "sign"
---

Sign a message or typed data with the connected wallet.

Smart blocks: cannot be nested. This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.

## Syntax

```evml
sign <variable> [message]
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `variable` | `variable` | Build time | Variable name |
| `[message]` | `string` | Build time | Plain-text message to sign |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--typed` | `string` | Build time | EIP-712 typed data JSON string |

<!-- HAND-WRITTEN -->

With `--typed`, the domain, message-struct, and final EIP-712 hashes are printed
from the actual supplied payload before the wallet is asked to sign.


## Examples

```evml
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
