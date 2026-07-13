---
title: "@lending:apy"
---

Current APY of a lending-market reserve as a decimal fraction (2.04% -> 0.0204). Pass `supply` for the deposit rate or `borrow` for the variable borrow rate.

**Returns**: `number`

## Syntax

```evml
@lending:apy(token side adapter?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `token` | `address` | Reserve token to inspect (use @token(SYM)) |
| `side` | `string` | `supply` for the deposit rate, `borrow` for the borrow rate |
| `[adapter]` | `lending-adapter` | Lending protocol: AaveV3, Spark or CompoundV3 (default: the best available on the chain) |

## Examples

```evml
# Print the WXDAI deposit APY (0.02 means 2%)
print "WXDAI supply APY:" @lending:apy(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d supply)

# Print the variable borrow APY
print "WXDAI borrow APY:" @lending:apy(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d borrow)
```

<!-- HAND-WRITTEN -->

## See Also
