---
title: "@vault:pendingRedeem"
---

Shares of a pending (not yet fulfilled) redemption request on an ERC-7540 vault, in base units of the share.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@vault:pendingRedeem(vault controller? requestId?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `vault` | `address` | ERC-7540 vault address |
| `[controller]` | `address` | Controller of the request (defaults to the connected account) |
| `[requestId]` | `number` | Request id (defaults to 0, the controller-keyed convention) |

## Examples

```evml
# Print the shares waiting for fulfillment on the Centrifuge JTRSY vault
load vault

switch mainnet
print "pending:" @vault:pendingRedeem(0xFE6920eB6C421f1179cA8c8d4170530CDBdfd77A)
```

<!-- HAND-WRITTEN -->

## See Also
