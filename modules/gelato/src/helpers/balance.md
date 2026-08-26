---
title: "@gelato:balance"
---

USDC a sponsor has put into the Gelato Gas Tank and not withdrawn (deposits minus withdrawals, 6 decimals), read from Polygon whatever chain the script is on. Fees Gelato has already charged are not deducted — the live balance is on app.gelato.cloud.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@gelato:balance(sponsor?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[sponsor]` | `address` | Gas Tank sponsor (defaults to the connected account) |

## Examples

```evml
# Check how much USDC a sponsor still has in the Gas Tank
set $tank @gelato:balance(0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71)
```

<!-- HAND-WRITTEN -->

## Notes

- Reads Polygon whatever chain the script is on. Deposits minus withdrawals — the
  fees Gelato has already charged are only visible in the Gelato app.


## See Also
