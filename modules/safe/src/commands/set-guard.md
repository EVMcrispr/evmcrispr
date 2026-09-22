---
title: "safe:set-guard"
---

Set a transaction guard on the Safe: a contract that checks every transaction before and after execution (e.g. a Zodiac ScopeGuard).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
safe:set-guard <guard>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `guard` | `address` | Runtime in smart blocks | Guard contract address |

<!-- HAND-WRITTEN -->

## Examples

```evml
# TODO: add examples
```

## See Also
