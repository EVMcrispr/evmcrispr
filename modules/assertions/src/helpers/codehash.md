---
title: "@assertions:codehash"
---

Read the code hash of an address at script build time, with EXTCODEHASH semantics: `bytes32(0)` for a nonexistent account (zero nonce, balance and code), `keccak256` of the code otherwise. Matches what @codehash! reads on-chain at assertion time.

**Returns**: `bytes32`

## Syntax

```evml
@assertions:codehash(address)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `address` | `address` | Address to read |

<!-- HAND-WRITTEN -->

`@codehash` snapshots the hash at script *build* time (frozen into the script), with the same EXTCODEHASH semantics as [@codehash!](codehash-bang.md), which instead reads it on-chain at *assertion* time.

## Examples

```evml
load assertions [@codehash]

assertions:assert-codehash 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb @codehash(0xf8D1677c8a0c961938bf2f9aDc3F3CFDA759A9d9) "implementation changed"
```

## See Also

- [@assertions:codehash!](codehash-bang.md), [assertions:assert-codehash](../commands/assert-codehash.md)
