---
title: "aragonosx:execute-proposal"
---

Execute a passed proposal on a governance plugin.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
aragonosx:execute-proposal <plugin> <proposalId>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `plugin` | `plugin` | Build time | Governance plugin holding the proposal |
| `proposalId` | `number` | Runtime in smart blocks | Proposal id |

## Examples

```evml
# Execute a token-voting proposal that has passed
aragonosx:connect 0x2222222222222222222222222222222222222222 (
  aragonosx:execute-proposal token-voting 3
)
```

<!-- HAND-WRITTEN -->

## See Also
