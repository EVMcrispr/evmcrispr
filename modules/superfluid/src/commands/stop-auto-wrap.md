---
title: "superfluid:stop-auto-wrap"
---

Cancel an auto-wrap schedule. The strategy's token allowance is not touched — revoke it with token:approve 0 if you want it gone.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: build-time inputs only. The token identifies a schedule before signing; this command has no runtime amount.

## Syntax

```evml
superfluid:stop-auto-wrap <token>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `token` | `supertoken` | Build time | SuperToken symbol (e.g. USDCx) or address |

## Examples

```evml
# Stop auto-wrapping USDCx
superfluid:stop-auto-wrap USDCx
```

<!-- HAND-WRITTEN -->

## See Also
