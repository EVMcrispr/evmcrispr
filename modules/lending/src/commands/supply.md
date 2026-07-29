---
title: "lending:supply"
---

Supply a token to a lending market, approving the pool automatically when needed. Supplied tokens earn interest and can back borrows as collateral.

## Syntax

```evml
lending:supply <amount> <token>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amount` | `number` | Amount to supply, in base units (wei) |
| `token` | `address` | Token to supply (use @token(SYM); lending markets take the wrapped token, not the native one) |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--using` | `lending-adapter` | Lending protocol: AaveV3, Spark or CompoundV3 (default: the best available on the chain) |
| `--on-behalf-of` | `address` | Account credited with the supplied position (defaults to the connected account) |
| `--no-approve` | `bool` | Skip the automatic allowance check and approve action |

## Examples

```evml
# Supply 100 WXDAI to Aave v3 on Gnosis (auto-approves)
lending:supply 100e18 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d

# Supply on behalf of another account
lending:supply 100e18 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d --on-behalf-of 0x4F2083f5fBede34C2714aFfb3105539775f7FE64

# Supply to SparkLend instead of the default market
lending:supply 100e18 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d --using Spark
```

<!-- HAND-WRITTEN -->

## Compound v3 semantics

A Compound v3 (Comet) market revolves around a single base asset (e.g. USDC).
Supplying the base asset earns interest — or repays your debt if you have one;
supplying any other listed token adds collateral, which earns nothing and is
managed automatically (no `set-collateral` needed). When a token is collateral
on several markets of the same chain, `supply` picks the most prominent one
(USDC market first).

## See Also

- [lending:withdraw](withdraw.md)
- [lending:borrow](borrow.md)
