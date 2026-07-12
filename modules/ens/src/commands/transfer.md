---
title: "ens:transfer"
---

Transfer ownership of an ENS name.

## Syntax

```evml
ens:transfer <name> <newOwner>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | ENS name (e.g. mydao.eth) |
| `newOwner` | `address` | New owner address |

<!-- HAND-WRITTEN -->

## Examples

```evml
load ens

# Hand a name over to the DAO agent
ens:transfer mydao.eth 0x1234567890abcdef1234567890abcdef12345678
```

## Notes

- Wrapped names transfer the NameWrapper ERC-1155 token; unwrapped `.eth`
  second-level names transfer the registrant NFT (the new owner can then
  `reclaim` registry control); everything else uses `setOwner` on the
  registry.

## See Also

- [@ens:owner](../helpers/owner.md) — read the current owner
