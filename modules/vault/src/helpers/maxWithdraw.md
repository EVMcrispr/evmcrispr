---
title: "@vault:maxWithdraw"
---

Maximum amount of underlying assets an account can withdraw from an ERC-4626 vault, in base units of the asset.

**Returns**: `number`

## Syntax

```evml
@vault:maxWithdraw(vault account?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `vault` | `address` | ERC-4626 vault address |
| `[account]` | `address` | Account to inspect (defaults to the connected account) |

## Examples

```evml
# Print how much WXDAI the connected account can withdraw
print "Withdrawable:" @vault:maxWithdraw(0xaf204776c7245bF4147c2612BF6e5972Ee483701 @me)
```

<!-- HAND-WRITTEN -->

## See Also
