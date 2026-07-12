---
title: "access-control:transfer-ownership"
---

Transfer ownership of an Ownable contract. On Ownable2Step contracts this stages the pending owner, who must then accept.

## Syntax

```evml
access-control:transfer-ownership <contract> <newOwner>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `contract` | `address` | Ownable contract address |
| `newOwner` | `address` | New owner address |

<!-- HAND-WRITTEN -->

## Examples

```evml
load access-control

# Hand over a token contract to the DAO treasury
access-control:transfer-ownership 0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
```

## Notes

- Must be sent by the current owner.
- On plain `Ownable` contracts the transfer is immediate. On `Ownable2Step`
  contracts this only stages the pending owner, who must then run
  [access-control:accept-ownership](accept-ownership.md); passing the zero address cancels
  a pending transfer.

## See Also

- [access-control:accept-ownership](accept-ownership.md) — finalize a two-step transfer
- [@access-control:owner](../helpers/owner.md) — read the current owner
- [@access-control:pendingOwner](../helpers/pendingOwner.md) — read the pending owner
