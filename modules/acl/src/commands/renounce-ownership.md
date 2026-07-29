---
title: "acl:renounce-ownership"
---

Renounce ownership of an Ownable contract, leaving it without an owner and permanently disabling its onlyOwner functions.

## Syntax

```evml
acl:renounce-ownership <contract>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `contract` | `address` | Ownable contract address |

<!-- HAND-WRITTEN -->

## Examples

```evml
load acl

acl:renounce-ownership 0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72
```

## Notes

- **Irreversible**: the contract is left without an owner and every
  `onlyOwner` function becomes permanently uncallable.
- Must be sent by the current owner.

## See Also

- [acl:transfer-ownership](transfer-ownership.md) — hand over instead of renouncing
