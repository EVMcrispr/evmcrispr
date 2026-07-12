---
title: "assertions:assert-codehash"
---

Assert an address has a specific code hash, on-chain.

## Syntax

```evml
assertions:assert-codehash <target> <expected> [message]
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
load assertions [@codehash]

# Pin an implementation by its runtime code hash
assertions:assert-codehash 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb @codehash(0xf8D1677c8a0c961938bf2f9aDc3F3CFDA759A9d9) "implementation changed"
```

## See Also
