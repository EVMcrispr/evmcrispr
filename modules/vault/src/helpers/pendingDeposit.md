---
title: "@vault:pendingDeposit"
---

Assets of a pending (not yet fulfilled) deposit request on an ERC-7540 vault, in base units of the asset. As @pendingDeposit! the pendingDepositRequest read happens on-chain at assertion time.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@vault:pendingDeposit(vault controller? requestId?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `vault` | `address` | ERC-7540 vault address |
| `[controller]` | `address` | Controller of the request (defaults to the connected account) |
| `[requestId]` | `number` | Request id (defaults to 0, the controller-keyed convention) |

## Examples

```evml
# Print the assets waiting for fulfillment on the Centrifuge JTRSY vault
load vault

switch mainnet
print "pending:" @vault:pendingDeposit(0xFE6920eB6C421f1179cA8c8d4170530CDBdfd77A)
```

<!-- HAND-WRITTEN -->

## See Also

## On-chain face (@pendingDeposit!)

Read pendingDepositRequest(requestId, controller) at assertion time
(requestId defaults to 0, the controller-keyed convention).

#
