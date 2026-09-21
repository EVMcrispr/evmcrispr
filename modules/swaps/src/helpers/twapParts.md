---
title: "@swaps:twapParts"
---

JSON page of TWAP parts with exact UIDs, trading windows, submission observations and verified settlement receipts. Offset defaults to 0; limit defaults to 100 (maximum 128).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `string`

## Syntax

```evml
@swaps:twapParts(order offset? limit?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `order` | `string` | Portable JSON TWAP reference |
| `[offset]` | `number` | Zero-based part offset (default: 0) |
| `[limit]` | `number` | Parts to return (default: 100, maximum: 128) |

<!-- HAND-WRITTEN -->

## Example

Using the version-1 JSON reference saved by `swaps:twap`:

```evml novalidate
print @swaps:twapParts($order)
print @swaps:twapParts($order 100 100)
```

Returns a JSON string with `items`, `offset`, `nextOffset`, `totalParts`, and
`evidence`. The default page starts at zero and contains at most 100 parts;
the maximum page size is 128. `nextOffset` is null at the end. Missing mining-time
registration history can leave the page empty with incomplete coverage.

Each item contains its zero-based `index`, exact CoW `uid`, `start`, inclusive
`validTo`, `window`, current registration, orderbook `submission` observation,
`orderbookStatus`, `filled`, `settlement`, and `finality`. A settlement includes
its transaction hash, block number/hash, and executed token amounts.

Page size bounds returned parts and orderbook lookups; evidence reconstruction
has separate bounded history and receipt budgets. Exhausting those budgets is
reported as incomplete coverage. Missing API records are not proof of failure.
Only canonical settlement receipts establish fills. See `@swaps:twapStatus`
for observation, coverage, reorganization, and finality semantics.
