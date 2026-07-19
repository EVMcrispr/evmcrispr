---
title: "@superfluid:flow"
---

Current flow rate between a sender and a receiver, in wei per second (0 when no stream exists).

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
