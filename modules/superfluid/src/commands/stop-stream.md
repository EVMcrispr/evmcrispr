---
title: "superfluid:stop-stream"
---

Stop a money stream to a receiver, refunding the sender's buffer deposit. With --from, deletes another sender's stream — allowed for the stream's receiver, a granted flow operator, or anyone once the sender is insolvent.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
superfluid:stop-stream <token> <to> <receiver>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `token` | `supertoken` | Build time | SuperToken symbol (e.g. USDCx) or address |
| `to` | `command` | Build time | Keyword `to` |
| `receiver` | `address` | Runtime in smart blocks | Stream receiver |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--from` | `address` | Runtime in smart blocks | Stream sender when stopping a stream you don't send (as receiver or flow operator) |

## Examples

```evml
# Stop your stream to a receiver (buffer is refunded)
superfluid:stop-stream xDAIx to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71
```

<!-- HAND-WRITTEN -->

## See Also
