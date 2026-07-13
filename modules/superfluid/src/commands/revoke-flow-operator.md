---
title: "superfluid:revoke-flow-operator"
---

Revoke an operator's permissions over your streams of a SuperToken.

## Syntax

```evml
superfluid:revoke-flow-operator <token> <from> <operator>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `token` | `supertoken` | SuperToken symbol (e.g. USDCx) or address |
| `from` | `command` | Keyword `from` |
| `operator` | `address` | Flow operator |

## Examples

```evml
# Revoke an operator's rights over your xDAIx streams
superfluid:revoke-flow-operator xDAIx from 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
```

<!-- HAND-WRITTEN -->

## See Also

