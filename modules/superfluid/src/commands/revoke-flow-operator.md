---
title: "superfluid:revoke-flow-operator"
---

Revoke an operator's permissions over your streams of a SuperToken.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
superfluid:revoke-flow-operator <token> <from> <operator>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `token` | `supertoken` | Build time | SuperToken symbol (e.g. USDCx) or address |
| `from` | `command` | Build time | Keyword `from` |
| `operator` | `address` | Runtime in smart blocks | Flow operator |

## Examples

```evml
# Revoke an operator's rights over your xDAIx streams
superfluid:revoke-flow-operator xDAIx from 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
```

<!-- HAND-WRITTEN -->

## See Also
