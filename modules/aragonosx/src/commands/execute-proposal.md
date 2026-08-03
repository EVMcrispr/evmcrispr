---
title: "aragonosx:execute-proposal"
---

Execute a passed proposal on a governance plugin.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
aragonosx:execute-proposal <plugin> <proposalId>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `plugin` | `plugin` | Governance plugin holding the proposal |
| `proposalId` | `number` | Proposal id |

## Examples

```evml
# Execute a token-voting proposal that has passed
aragonosx:connect 0x2222222222222222222222222222222222222222 (
  aragonosx:execute-proposal token-voting 3
)
```

<!-- HAND-WRITTEN -->

## See Also
