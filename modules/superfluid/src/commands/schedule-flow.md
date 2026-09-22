---
title: "superfluid:schedule-flow"
---

Schedule a stream to start and/or end at future timestamps, executed by Superfluid's keeper network. Automatically grants the FlowScheduler the flow-operator permissions it needs (create for --start, delete for --end) plus a SuperToken allowance when --start-amount is set. At least one of --start / --end is required; execution is permissionless but not guaranteed if the grants are revoked.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
superfluid:schedule-flow <rate> <token> <to> <receiver>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `rate` | `number` | Runtime in smart blocks | Flow rate in wei per second (e.g. 1000e18/mo); may be 0 for end-only schedules |
| `token` | `supertoken` | Build time | SuperToken symbol (e.g. USDCx) or address |
| `to` | `command` | Build time | Keyword `to` |
| `receiver` | `address` | Runtime in smart blocks | Stream receiver |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--start` | `number` | Runtime in smart blocks | Unix timestamp at which the keeper opens the stream |
| `--start-window` | `number` | Build time | How long after --start the keeper may still open the stream (default 3d) |
| `--end` | `number` | Runtime in smart blocks | Unix timestamp at which the keeper closes the stream |
| `--start-amount` | `number` | Runtime in smart blocks | Optional lump-sum SuperToken transfer when the stream starts (needs an allowance, granted automatically) |
| `--no-approve` | `bool` | Build time | Skip the automatic permission grant and allowance actions |

## Examples

```evml
# Schedule a salary stream to open on Jan 1st 2034 and close a year later, run by Superfluid keepers
superfluid:schedule-flow 1000e18/mo xDAIx to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 --start 2019686400 --end 2051222400
```

<!-- HAND-WRITTEN -->

## See Also
