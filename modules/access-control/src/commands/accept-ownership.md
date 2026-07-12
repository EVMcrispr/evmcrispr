---
title: "access-control:accept-ownership"
---

Accept a pending ownership transfer of an Ownable2Step contract. Must be sent by the pending owner.

## Syntax

```evml
access-control:accept-ownership <contract>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `contract` | `address` | Ownable2Step contract address |

<!-- HAND-WRITTEN -->

## Examples

```evml
load access-control

access-control:accept-ownership 0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72
```

## Notes

- Must be sent by the pending owner staged with
  [access-control:transfer-ownership](transfer-ownership.md).

## See Also

- [access-control:transfer-ownership](transfer-ownership.md) — start the transfer
- [@access-control:pendingOwner](../helpers/pendingOwner.md) — read the pending owner
