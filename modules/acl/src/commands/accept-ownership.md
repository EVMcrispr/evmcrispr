---
title: "acl:accept-ownership"
---

Accept a pending ownership transfer of an Ownable2Step contract. Must be sent by the pending owner.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
acl:accept-ownership <contract>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `contract` | `address` | Runtime in smart blocks | Ownable2Step contract address |

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
