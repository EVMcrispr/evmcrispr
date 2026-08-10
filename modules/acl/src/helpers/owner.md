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

## On-chain face (@owner!)

Read owner() at assertion time — pin that a batch did not rotate an
Ownable contract's owner.

### Examples

```evml
load acl

set $vault 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2

assert @owner!($vault) == @me "owner rotated"
```
