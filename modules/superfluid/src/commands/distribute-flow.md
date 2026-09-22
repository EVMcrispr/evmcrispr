---
title: "superfluid:distribute-flow"
---

Stream a SuperToken to all members of a GDA pool, split pro-rata to their units as they change over time. Rates are wei per second — use a rate literal like 1000e18/mo; a rate of 0 stops the distribution flow. Like any stream, it locks a buffer deposit from the distributor.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
superfluid:distribute-flow <rate> <token> <to> <pool>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `rate` | `number` | Runtime in smart blocks | Flow rate in wei per second (e.g. 1000e18/mo), or 0 to stop |
| `token` | `supertoken` | Build time | SuperToken symbol (e.g. USDCx) or address |
| `to` | `command` | Build time | Keyword `to` |
| `pool` | `address` | Runtime in smart blocks | GDA pool address |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--from` | `address` | Runtime in smart blocks | Distributor account (defaults to the connected account; pools only accept third-party distributors when created with --open-distribution) |

## Examples

```evml
# Stream 1000 xDAIx a month to all members of a rewards pool
superfluid:create-pool $rewards xDAIx
superfluid:set-units 1 to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 in $rewards
superfluid:distribute-flow 1000e18/mo xDAIx to $rewards
```

<!-- HAND-WRITTEN -->

## See Also
