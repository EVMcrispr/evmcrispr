---
title: "@safe:messageHash"
---

Return the SafeMessage hash of an off-chain message (plain string or typed-data JSON), as signed by Safe owners or SignMessageLib.

**Returns**: `bytes32`

## Syntax

```evml
@safe:messageHash(message safe?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `message` | `string` | Raw message string, or an EIP-712 typed-data JSON document |
| `[safe]` | `address` | Safe address (defaults to the context Safe or connected account) |

<!-- HAND-WRITTEN -->

## Examples

Mark a message as signed on-chain through SignMessageLib (the hash the
library stores is the SafeMessage hash this helper returns):

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
set $hash @safe:messageHash("I agree to the terms" $mySafe)
```

## See Also

- [safe:verify-message](../commands/verify-message.md)
