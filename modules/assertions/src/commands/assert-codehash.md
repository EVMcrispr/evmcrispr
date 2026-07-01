---
title: "assert-codehash"
---

Assert an address has a specific code hash, on-chain.

## Syntax

```evml
assert-codehash <target> <expected> [message]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `target` | `address` | Address to check |
| `expected` | `bytes32` | Expected code hash (keccak256 of the runtime bytecode) |
| `[message]` | `string` | Revert message when the assertion fails |

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

# Pin an implementation by its runtime code hash
assertions:assert-codehash 0xAbC... @codehash(0xDeF...) "implementation changed"
```

## See Also
