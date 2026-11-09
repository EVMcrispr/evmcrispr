---
title: "ens:transfer"
---

Transfer ownership of an ENS name. An ENSv2 .eth name moves its registry token, with the owner's roles. On ENS v1, an unwrapped .eth name hands over both the registrant NFT and the Registry controller (reclaim); transferring to the current registrant just reclaims the controller role.

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
ens:transfer <name> <to> <newOwner>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `name` | `string` | Build time | ENS name (e.g. mydao.eth) |
| `to` | `command` | Build time | Keyword `to` |
| `newOwner` | `address` | Runtime in smart blocks | New owner address |

<!-- HAND-WRITTEN -->

## Examples

```evml
load ens

# Hand a name over to the DAO agent
ens:transfer mydao.eth to 0x1234567890abcdef1234567890abcdef12345678

# ENS v1: reclaim registry control of a name you received without a reclaim
ens:transfer mydao.eth to @me
```

## Notes

- An ENSv2 `.eth` name (registered since ENSv2, or migrated to it) moves its
  ETHRegistry token from its owner, and the registry moves the owner's roles
  with it. The owner must hold the transfer role, which a registration gives.
  There is no separate controller to reclaim, so transferring an ENSv2 name to
  its current owner stops with an error.
- On ENS v1, wrapped names transfer the NameWrapper ERC-1155 token; everything that is
  neither wrapped nor a `.eth` second-level name uses `setOwner` on the
  registry.
- Unwrapped `.eth` second-level names hand over both roles: the Registry
  controller (via `reclaim`) and the registrant NFT, in that order.
- Transferring an unwrapped `.eth` name to its current registrant is a pure
  `reclaim`: it resets the Registry controller without moving the NFT —
  useful after receiving a name from someone who didn't reclaim.

## See Also

- [@ens:owner](../helpers/owner.md) — read the current owner
