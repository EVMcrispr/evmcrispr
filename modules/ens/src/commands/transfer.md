---
title: "ens:transfer"
---

Transfer ownership of an ENS name. For unwrapped .eth names this hands over both the registrant NFT and the Registry controller (reclaim); transferring to the current registrant just reclaims the controller role.

## Syntax

```evml
ens:transfer <name> <to> <newOwner>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | ENS name (e.g. mydao.eth) |
| `to` | `command` | Keyword `to` |
| `newOwner` | `address` | New owner address |

<!-- HAND-WRITTEN -->

## Examples

```evml
load ens

# Hand a name over to the DAO agent
ens:transfer mydao.eth to 0x1234567890abcdef1234567890abcdef12345678

# Reclaim registry control of a name you received without a reclaim
ens:transfer mydao.eth to @me
```

## Notes

- Wrapped names transfer the NameWrapper ERC-1155 token; everything that is
  neither wrapped nor a `.eth` second-level name uses `setOwner` on the
  registry.
- Unwrapped `.eth` second-level names hand over both roles: the Registry
  controller (via `reclaim`) and the registrant NFT, in that order.
- Transferring an unwrapped `.eth` name to its current registrant is a pure
  `reclaim`: it resets the Registry controller without moving the NFT —
  useful after receiving a name from someone who didn't reclaim.

## See Also

- [@ens:owner](../helpers/owner.md) — read the current owner
