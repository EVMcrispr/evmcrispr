---
title: "@proxies:predictClone"
---

Predicted address of a deterministic ERC-1167 clone deployed with proxies:clone --salt. Pure computation, no chain read.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `address`

## Syntax

```evml
@proxies:predictClone(implementation salt deployer?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `implementation` | `address` | Implementation contract the clone delegates to |
| `salt` | `bytes32` | CREATE2 salt |
| `[deployer]` | `address` | CREATE2 factory (defaults to the Arachnid deployer) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load proxies

set $implementation 0xf8D1677c8a0c961938bf2f9aDc3F3CFDA759A9d9

set $predicted @proxies:predictClone($implementation 0x0000000000000000000000000000000000000000000000000000000000000001)
proxies:clone $clone $implementation --salt 0x0000000000000000000000000000000000000000000000000000000000000001
# $predicted == $clone
```

## Notes

- Pure computation (CREATE2 with the ERC-1167 initcode hash) — no chain
  read. `deployer` defaults to the Arachnid CREATE2 factory used by
  proxies:clone.

## See Also

- [proxies:clone](../commands/clone.md)
