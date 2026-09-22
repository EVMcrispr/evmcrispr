---
title: "switch"
---

Switch the active chain by name or ID.

Smart blocks: cannot be nested. This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.

## Syntax

```evml
switch <networkNameOrId>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `networkNameOrId` | `chain` | Build time | Chain name in camelCase as exported by viem (e.g. `mainnet`, `gnosis`, `baseSepolia`, `polygonZkEvm`) or numeric chain ID |

## Examples

```evml
# Switch by chain name
switch gnosis

# Testnets and multi-word chains use camelCase viem names
switch baseSepolia

# Switch by chain ID
switch 137
```

<!-- HAND-WRITTEN -->

## See Also

- [eez:on](../../../eez/src/commands/on.md) — run a block on another EEZ chain from the current one, through cross-chain proxies, without moving the wallet
