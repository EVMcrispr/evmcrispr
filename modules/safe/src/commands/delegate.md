---
title: "safe:delegate"
---

Let an account propose Safe transactions on the Safe Transaction Service on behalf of the connected owner, without confirming them.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: cannot be nested. This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.

## Syntax

```evml
safe:delegate <safe> <delegate>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `safe` | `address` | Build time | Safe address |
| `delegate` | `address` | Build time | Account that may propose, other than an owner |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--label` | `string` | Build time | Name shown for the delegate (defaults to evmcrispr) |
| `--expires` | `number` | Build time | Unix timestamp after which the delegate can no longer propose, e.g. @date(now +30d) |

<!-- HAND-WRITTEN -->

## Examples

```evml
# TODO: add examples
```

## See Also
