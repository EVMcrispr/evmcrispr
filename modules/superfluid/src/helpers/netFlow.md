---
title: "@superfluid:netFlow"
---

Net flow rate of an account (all incoming minus all outgoing streams, CFA plus GDA), in wei per second. Negative means the balance is draining.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@superfluid:netFlow(token account)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `token` | `supertoken` | SuperToken symbol or address |
| `account` | `address` | Account to inspect |

## Examples

```evml
# Assert your xDAIx balance is not draining before ending the script
print "Net flow:" @superfluid:netFlow(xDAIx @me)
```

<!-- HAND-WRITTEN -->

## See Also

## On-chain face (@netFlow!)

Read getAccountFlowrate() on the CFA forwarder and getNetFlow() on the
GDA forwarder at assertion time, then add them on-chain: neither
agreement knows the other half. The result is signed, so a draining
account reads negative and an ordering comparison picks the int256
overload.

#
