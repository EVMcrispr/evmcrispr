---
title: "@swaps:twapStatus"
---

JSON TWAP status: independent registration, schedule, verified settlement totals, evidence coverage/finality, indexer discovery and current-part submission. Incomplete history reports unknown; expiry never proves fills.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `string`

## Syntax

```evml
@swaps:twapStatus(order)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `order` | `string` | JSON order reference bound by swaps:twap |

<!-- HAND-WRITTEN -->

## Example

Using the `$order` reference saved by `swaps:twap`:

```evml novalidate
print @swaps:twapStatus($order)
```

The result remains a JSON string and accepts portable version-1 references.
Amounts and timestamps are decimal strings. Call it outside batches that
already contain actions; the controller need not be connected.

| Field | Meaning |
| --- | --- |
| `registered` | Current on-chain authorization. |
| `schedule` | `unregistered`, `scheduled`, `active`, `between-windows`, or `expired`. |
| `cancelled`, `expired` | Removal observed in verified history and elapsed schedule, independently of fills. Cancellation is null without registration history; expiry is null when the start is unknown. |
| `filled` | `none`, `partial`, `complete`, or `unknown`. Complete requires settlement evidence for every distinct part. |
| `filledParts`, `totalParts` | Number of verified settled parts and number scheduled. |
| `executedSellAmount`, `executedBuyAmount` | Base-unit totals from verified settlement events. |
| `evidence` | Coverage (`complete`), reasons for incomplete coverage, observation `blockNumber` and `blockHash`. |
| `finality` | `finalized`, `pending`, or `unknown` according to the RPC's finalized block. |
| `discovery` | Indexer parent record: `observed`, `not-observed`, `unavailable`, or `skipped`. |
| `submission` | Current part index, separate orderbook observation, and reported orderbook status when present. |
| `start`, `end` | Effective schedule timestamps, or null when unavailable. |
| `remainingSellBalance`, `allowance` | Current execution account funds and CoW relayer allowance; these do not establish fills. |

Mining-time starts are recovered from the verified registration transaction and
block, even after cancellation clears stored context. Part UIDs use the CoW
EIP-712 domain and exact deployed schedule rules. Account, registration lifetime,
and UID must all match. Records for another order in a reused Safe are excluded.

The helper uses bounded CoW API lookups as discovery hints, then verifies fills
against canonical settlement receipts and `Trade` events. Paginated chain history
is the fallback. Missing history or an exhausted lookup budget produces `unknown`
with the known verified count and reason. It never infers fills from balances,
elapsed time, an indexer's `Completed` label, or a settlement fill counter, which
CoW can clear after expiry. API outages do not remove valid on-chain evidence.

Reads are anchored to one block. Receipt block hashes are checked, and a detected
reorganization invalidates evidence for that observation. No evidence cache is
retained across calls. RPCs without finalized-block support report finality as
unknown. Incomplete coverage does not erase individual verified fills.

Indexer discovery and orderbook acceptance are independent observations.
`not-observed` means no matching record was found, not that submission failed.
Inside `sim:fork` external observations are `skipped`. Outside simulation the
helper reads CoW APIs; it never submits an order or starts a monitor.
