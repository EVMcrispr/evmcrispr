---
title: "@superfluid:flow"
---

Current flow rate between a sender and a receiver, in wei per second (0 when no stream exists).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@superfluid:flow(token sender receiver)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `token` | `supertoken` | SuperToken symbol or address |
| `sender` | `address` | Stream sender |
| `receiver` | `address` | Stream receiver |

## Examples

```evml
# Print the current flow rate between two accounts
print "Flow rate:" @superfluid:flow(xDAIx 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71)
```

<!-- HAND-WRITTEN -->

## See Also

## On-chain face (@flow!)

Read getFlowrate(token, sender, receiver) at assertion time, so a batch
gates on the stream still running when it executes rather than when it
was built. The SuperToken resolves at composition time; sender and
receiver may be live values.

#
