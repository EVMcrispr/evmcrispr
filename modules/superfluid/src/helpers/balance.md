---
title: "@superfluid:balance"
---

Real-time available SuperToken balance of an account: the streaming balance at this instant, minus buffer deposits. Negative when the account is critical. As @balance! the realtimeBalanceOfNow() read happens on-chain at assertion time, so the balance is the one the batch itself sees streaming (the SuperToken still resolves at composition time).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@superfluid:balance(token account?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `token` | `supertoken` | SuperToken symbol or address |
| `[account]` | `address` | Account to inspect (defaults to the connected account) |

## Examples

```evml
# Print your real-time xDAIx balance (streaming balance minus buffers)
print "Balance:" @superfluid:balance(xDAIx)
```

<!-- HAND-WRITTEN -->

## See Also

## On-chain face (@balance!)

Read realtimeBalanceOfNow(account) at assertion time and pick the
available balance (word 0, already net of the buffer), so the value is
the balance the batch itself sees streaming. Signed: a critical account
reads negative.

#
