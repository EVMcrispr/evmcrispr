---
title: "@assertions:codehash"
---

Read the code hash of an address with EXTCODEHASH semantics: `bytes32(0)` for a nonexistent account (zero nonce, balance and code), `keccak256` of the code otherwise. Plain @codehash reads at script build time; @codehash! reads on-chain at assertion time, and its account can be a `::` call resolving to an address, such as a proxy implementation.

**Returns**: `bytes32`

## Syntax

```evml
@assertions:codehash(address)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `address` | `address` | Address to read (in @codehash! also a `::` call resolving to one) |

<!-- HAND-WRITTEN -->

`@codehash` snapshots the hash at script *build* time (frozen into the script), with the same EXTCODEHASH semantics as its on-chain face `@codehash!`, which instead reads it on-chain at *assertion* time.

## Examples

```evml
load assertions [@codehash]

assertions:assert-codehash 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb @codehash(0xf8D1677c8a0c961938bf2f9aDc3F3CFDA759A9d9) "implementation changed"
```

## See Also

- [assertions:assert-codehash](../commands/assert-codehash.md)

## On-chain face (@codehash!)

The EXTCODEHASH of an account, read on-chain at assertion time: `bytes32(0)` for a nonexistent account, `keccak256` of the code otherwise. The account can be a `::` call resolving to an address, such as a proxy implementation.

Unlike the plain `@codehash` face, which snapshots the hash at script *build* time, `@codehash!` reads it at *assertion* time — the value the chain holds when the batch executes. Both follow EXTCODEHASH semantics, so they agree on every account; reach for `@codehash!` when the code could change between building and executing, or when the address itself is only known on-chain.

### Examples

```evml
load assertions

set $proxy 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb

# The proxy's current implementation is the audited contract
assertions:assert @codehash!($proxy::{implementation()(address)}) == 0xf5175b73708be1e8daf1aad42b8788d13ac9adbcc61a5945743c167a76ba7dc5 "implementation changed"

# Two deployments share the same runtime code
assertions:assert @codehash!(0xf8D1677c8a0c961938bf2f9aDc3F3CFDA759A9d9) == @codehash!(0x1E80A006ce9B0F42a1E1AAf47e6e63e63aae60d5)
```

### See Also

- [assertions:assert-codehash](../commands/assert-codehash.md)
