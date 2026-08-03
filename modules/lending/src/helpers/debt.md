---
title: "@lending:debt"
---

Current variable-rate debt of an account in a token, in base units (grows every block as interest accrues).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@lending:debt(account token adapter?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `account` | `address` | Account to inspect |
| `token` | `address` | Borrowed token (use @token(SYM)) |
| `[adapter]` | `lending-adapter` | Lending protocol: AaveV3, Spark or CompoundV3 (default: the best available on the chain) |

## Examples

```evml
# Print the connected account's variable WXDAI debt
print "WXDAI debt:" @lending:debt(@me 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d)
```

<!-- HAND-WRITTEN -->

## See Also
