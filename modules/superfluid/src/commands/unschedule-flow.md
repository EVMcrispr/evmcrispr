---
title: "superfluid:unschedule-flow"
---

Cancel a pending flow schedule (both its start and end legs). Streams already opened keep running — use stop-stream for those.

## Syntax

```evml
superfluid:unschedule-flow <token> <to> <receiver>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `token` | `supertoken` | SuperToken symbol (e.g. USDCx) or address |
| `to` | `command` | Keyword `to` |
| `receiver` | `address` | Scheduled receiver |

## Examples

```evml
# Cancel a pending scheduled stream
superfluid:unschedule-flow xDAIx to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71
```

<!-- HAND-WRITTEN -->

## See Also

