---
title: "@vault:claimableRedeem"
---

Shares of a fulfilled redemption request claimable from an ERC-7540 vault, in base units of the share.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@vault:claimableRedeem(vault controller? requestId?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `vault` | `address` | ERC-7540 vault address |
| `[controller]` | `address` | Controller of the request (defaults to the connected account) |
| `[requestId]` | `number` | Request id (defaults to 0, the controller-keyed convention) |

## Examples

```evml
# Print the shares ready to be claimed with vault:claim-redeem
load vault

switch mainnet
print "claimable:" @vault:claimableRedeem(0xFE6920eB6C421f1179cA8c8d4170530CDBdfd77A)
```

<!-- HAND-WRITTEN -->

## See Also

## On-chain face (@claimableRedeem!)

Read claimableRedeemRequest(requestId, controller) at assertion time
(requestId defaults to 0).

#
