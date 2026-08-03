---
title: "acl:accept-ownership"
---

Accept a pending ownership transfer of an Ownable2Step contract. Must be sent by the pending owner.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
acl:accept-ownership <contract>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `contract` | `address` | Ownable2Step contract address |

<!-- HAND-WRITTEN -->

## Examples

```evml
load acl

acl:accept-ownership 0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72
```

## Notes

- Must be sent by the pending owner staged with
  [acl:transfer-ownership](transfer-ownership.md).

## See Also

- [acl:transfer-ownership](transfer-ownership.md) — start the transfer
- [@acl:pendingOwner](../helpers/pendingOwner.md) — read the pending owner
