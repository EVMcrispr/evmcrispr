---
title: "superfluid:unschedule-flow"
---

Cancel a pending flow schedule (both its start and end legs). Streams already opened keep running — use stop-stream for those.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
superfluid:unschedule-flow <token> <to> <receiver>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `token` | `supertoken` | Runtime in smart blocks | SuperToken symbol (e.g. USDCx) or address |
| `to` | `command` | Build time | Keyword `to` |
| `receiver` | `address` | Runtime in smart blocks | Scheduled receiver |

## Examples

```evml
# Cancel a pending scheduled stream
superfluid:unschedule-flow xDAIx to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71
```

<!-- HAND-WRITTEN -->

## See Also
