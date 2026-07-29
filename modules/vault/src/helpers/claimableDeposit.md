---
title: "@vault:claimableDeposit"
---

Assets of a fulfilled deposit request claimable from an ERC-7540 vault, in base units of the asset.

**Returns**: `number`

## Syntax

```evml
@vault:claimableDeposit(vault controller? requestId?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `vault` | `address` | ERC-7540 vault address |
| `[controller]` | `address` | Controller of the request (defaults to the connected account) |
| `[requestId]` | `number` | Request id (defaults to 0, the controller-keyed convention) |

## Examples

```evml
# Print the assets ready to be claimed with vault:claim-deposit
load vault

switch mainnet
print "claimable:" @vault:claimableDeposit(0xFE6920eB6C421f1179cA8c8d4170530CDBdfd77A)
```

<!-- HAND-WRITTEN -->

## See Also
