---
title: "@lending:healthFactor"
---

Health factor of an account's lending position, 1e18-scaled (below 1e18 the position is liquidatable; uint256.max when the account has no debt). Composes with assertions: assert @lending:healthFactor(@me) >= 1.5e18.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@lending:healthFactor(account adapter?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `account` | `address` | Account to inspect |
| `[adapter]` | `lending-adapter` | Lending protocol: AaveV3, Spark or CompoundV3 (default: the best available on the chain) |

## Examples

```evml
# Print the health factor (1e18-scaled; below 1e18 is liquidatable)
print "Health factor:" @lending:healthFactor(@me)
```

<!-- HAND-WRITTEN -->

## See Also
