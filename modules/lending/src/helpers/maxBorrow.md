---
title: "@lending:maxBorrow"
---

How much of a token an account can still borrow against its current collateral, in base units of the token.

**Returns**: `number`

## Syntax

```evml
@lending:maxBorrow(account token adapter?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `account` | `address` | Account to inspect |
| `token` | `address` | Token to borrow (use @token(SYM)) |
| `[adapter]` | `lending-adapter` | Lending protocol: AaveV3, Spark or CompoundV3 (default: the best available on the chain) |

## Examples

```evml
# Print how much WXDAI the connected account can still borrow
print "Can still borrow:" @lending:maxBorrow(@me 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d)
```

<!-- HAND-WRITTEN -->

## See Also
