---
title: "superfluid:stream"
---

Open a money stream of a SuperToken to a receiver, or retarget an existing one to the new rate (idempotent). Rates are wei per second — use a rate literal like 1000e18/mo. Opening a stream locks a buffer deposit (hours of streaming) that is refunded when the stream stops.

## Syntax

```evml
superfluid:stream <rate> <token> <to> <receiver>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `rate` | `number` | Flow rate in wei per second, e.g. 1000e18/mo |
| `token` | `supertoken` | SuperToken symbol (e.g. USDCx) or address |
| `to` | `command` | Keyword `to` |
| `receiver` | `address` | Stream receiver |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--from` | `address` | Stream sender when acting as a flow operator (requires prior grant-flow-operator by the sender) |
| `--user-data` | `bytes` | Arbitrary user data forwarded to stream hooks |

## Examples

```evml
# Stream 1000 xDAIx a month to a contributor on Gnosis (idempotent: re-run with a new rate to change it)
superfluid:stream 1000e18/mo xDAIx to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71

# Raise an existing stream as a flow operator on behalf of the sender
load superfluid [stream]

stream 500e18/mo xDAIx to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 --from 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
```

<!-- HAND-WRITTEN -->

## See Also

