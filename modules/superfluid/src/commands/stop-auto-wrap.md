---
title: "superfluid:stop-auto-wrap"
---

Cancel an auto-wrap schedule. The strategy's token allowance is not touched — revoke it with token:approve 0 if you want it gone.

## Syntax

```evml
superfluid:stop-auto-wrap <token>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `token` | `supertoken` | SuperToken symbol (e.g. USDCx) or address |

## Examples

```evml
# Stop auto-wrapping USDCx
superfluid:stop-auto-wrap USDCx
```

<!-- HAND-WRITTEN -->

## See Also

