---
title: "@giveth:staked"
---

Raw GIV an account has staked for GIVpower: the gGIV balance on Gnosis, the deposit balance on Optimism and Polygon zkEVM. Includes locked GIV (see @giveth:unstakable).

**Returns**: `number`

## Syntax

```evml
@giveth:staked(account?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[account]` | `address` | Account to inspect (defaults to the connected account) |

## Examples

```evml
# Print your staked GIV
print "Staked GIV:" @giveth:staked()
```

<!-- HAND-WRITTEN -->

## See Also

- [@giveth:unstakable](unstakable.md)
- [@giveth:givpower](givpower.md)
- [giveth:stake](../commands/stake.md)
