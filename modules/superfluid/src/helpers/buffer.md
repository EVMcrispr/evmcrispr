---
title: "@superfluid:buffer"
---

Buffer deposit locked when opening a stream at the given flow rate (typically a few hours of streaming; Ethereum mainnet enforces per-token minimums). As @buffer! the getBufferAmountByFlowrate() read happens on-chain at assertion time, so a governance change to the deposit parameters is caught (the SuperToken and the rate literal still resolve at composition time).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@superfluid:buffer(token flowrate)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `token` | `supertoken` | SuperToken symbol or address |
| `flowrate` | `number` | Flow rate in wei per second, e.g. 1000e18/mo |

## Examples

```evml
# Print the deposit that opening a 1000 xDAIx/month stream would lock
print "Buffer:" @superfluid:buffer(xDAIx 1000e18/mo)
```

<!-- HAND-WRITTEN -->

## See Also

## On-chain face (@buffer!)

Read getBufferAmountByFlowrate(token, rate) at assertion time, so a
governance change to the deposit parameters between build and execution
is caught. The rate literal is still an exact rational floored to
wei/second at composition time.

#
