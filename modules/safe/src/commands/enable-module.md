---
title: "safe:enable-module"
---

Enable a module on the Safe, allowing it to execute transactions without owner signatures (e.g. a Zodiac module).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
safe:enable-module <module>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `module` | `address` | Runtime in smart blocks | Module address to enable |

<!-- HAND-WRITTEN -->

## Examples

```evml
# TODO: add examples
```

## See Also
