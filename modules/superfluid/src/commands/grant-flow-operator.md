---
title: "superfluid:grant-flow-operator"
---

Let an operator manage your streams of a SuperToken. Defaults to full control (create, update, delete) with unlimited flow-rate allowance; restrict with --permissions and --allowance. The allowance is a decrementing budget consumed by creates and rate increases.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
superfluid:grant-flow-operator <token> <to> <operator>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `token` | `supertoken` | Build time | SuperToken symbol (e.g. USDCx) or address |
| `to` | `command` | Build time | Keyword `to` |
| `operator` | `address` | Runtime in smart blocks | Flow operator |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--permissions` | `string` | Build time | `full` (default) or a quoted comma-separated set like "create,delete" |
| `--allowance` | `number` | Runtime in smart blocks | Flow-rate allowance in wei per second (e.g. 5000e18/mo); defaults to unlimited |

## Examples

```evml
# Let a manager contract open and close xDAIx streams on your behalf, capped at 5000 xDAIx a month
superfluid:grant-flow-operator xDAIx to 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 --permissions "create,delete" --allowance 5000e18/mo
```

<!-- HAND-WRITTEN -->

## See Also
