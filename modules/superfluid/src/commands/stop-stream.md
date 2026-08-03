---
title: "superfluid:stop-stream"
---

Stop a money stream to a receiver, refunding the sender's buffer deposit. With --from, deletes another sender's stream — allowed for the stream's receiver, a granted flow operator, or anyone once the sender is insolvent.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
superfluid:stop-stream <token> <to> <receiver>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `token` | `supertoken` | SuperToken symbol (e.g. USDCx) or address |
| `to` | `command` | Keyword `to` |
| `receiver` | `address` | Stream receiver |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--from` | `address` | Stream sender when stopping a stream you don't send (as receiver or flow operator) |

## Examples

```evml
# Stop your stream to a receiver (buffer is refunded)
superfluid:stop-stream xDAIx to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71
```

<!-- HAND-WRITTEN -->

## See Also
