---
title: "ens:set-addr"
---

Set the address record of an ENS name.

## Syntax

```evml
ens:set-addr <name> <address> [coinType]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | ENS name (e.g. mydao.eth) |
| `address` | `address` | Address to set |
| `[coinType]` | `number` | ENSIP-9/11 coin type (defaults to 60, ETH; e.g. @cointype(optimism); only EVM-style addresses are supported) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load ens

# Point mydao.eth at the executing account
ens:set-addr mydao.eth @me

# Set the address for an EVM L2 (ENSIP-11 coin type)
ens:set-addr mydao.eth 0x1234567890abcdef1234567890abcdef12345678 @cointype(optimism)
```

## Notes

- Without a coin type the default ETH record (coin type 60) is set.
- Only EVM-style (20-byte hex) addresses are supported for non-default coin
  types.

## See Also

- [@ens.addr](../helpers/ens.addr.md) — resolve an address record
- [@cointype](../helpers/cointype.md) — coin type of an EVM chain
- [ens:set-primary-name](set-primary-name.md) — set the reverse record
