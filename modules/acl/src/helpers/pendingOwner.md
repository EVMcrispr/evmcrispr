---
title: "@acl:pendingOwner"
---

Pending owner of an Ownable2Step contract (the zero address when no transfer is in progress).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `address`

## Syntax

```evml
@acl:pendingOwner(contract)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `contract` | `address` | Ownable2Step contract address |

<!-- HAND-WRITTEN -->

## Examples

```evml
load acl

set $contract 0x44fA8E6f47987339850636F88629646662444217
print @acl:pendingOwner($contract)
```

## Notes

- Returns the zero address when no two-step transfer is in progress.

## See Also

- [acl:accept-ownership](../commands/accept-ownership.md)

## On-chain face (@pendingOwner!)

Read pendingOwner() at assertion time — assert no Ownable2Step transfer
is in flight.

### Examples

```evml
load assertions
load acl

set $vault 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2

assertions:assert @pendingOwner!($vault) == 0x0000000000000000000000000000000000000000
```
