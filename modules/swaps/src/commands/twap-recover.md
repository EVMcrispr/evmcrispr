---
title: "swaps:twap-recover"
---

Return residual TWAP sell tokens after cancellation, expiry, or proven complete settlement, removing authorization and clearing the allowance. Reads the current balance; run after prior actions are mined.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
swaps:twap-recover <order>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `order` | `string` | JSON order reference bound by swaps:twap |

<!-- HAND-WRITTEN -->

## Example

Using the `$order` reference saved by `swaps:twap`:

```evml novalidate
# After cancellation, expiry, or verified settlement of every part:
swaps:twap-recover $order
```

Recovery removes the old order authorization, clears its relayer allowance,
and transfers the execution Safe's current balance of the sell token to the
original controller. It does not assume that an expired order was filled.

The order must be cancelled on-chain, past its full schedule, or proven fully
filled through canonical settlement receipts. Incomplete history or API-reported
completion alone cannot authorize early recovery. Recovery uses on-chain evidence
only, so an API outage cannot block it. No other live order may use the account.
Because the transfer amount is read while
encoding, recovery must come before any other state-changing actions in an
enclosing batch. Re-simulate delayed proposals before executing them.
