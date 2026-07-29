---
title: "switch"
---

Switch the active chain by name or ID.

## Syntax

```evml
switch <networkNameOrId>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `networkNameOrId` | `chain` | Chain name in camelCase as exported by viem (e.g. `mainnet`, `gnosis`, `baseSepolia`, `polygonZkEvm`) or numeric chain ID |

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
