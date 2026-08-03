---
title: "@acl:owner"
---

Current owner of an Ownable contract.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `address`

## Syntax

```evml
@acl:owner(contract)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `contract` | `address` | Ownable contract address |

<!-- HAND-WRITTEN -->

## Examples

```evml
load acl

set $owner @acl:owner(0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72)
print $owner
```

## See Also

- [acl:transfer-ownership](../commands/transfer-ownership.md)
- [@acl:pendingOwner](pendingOwner.md)
