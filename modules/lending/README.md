# lending module

Lending markets: supply, withdraw, borrow and repay (with `max` sugar for dust-exact debt repayment) with automatic approvals, plus health-factor, APY, max-borrow and debt helpers. Protocol selection via --using (Aave v3, Spark, Compound v3).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

```evml
load lending
```

## Commands

| Command | Description |
|---------|-------------|
| [lending:borrow](src/commands/borrow.md) | Borrow a token from a lending market against the connected account's collateral (variable rate). The borrowed tokens go to the connected account. |
| [lending:repay](src/commands/repay.md) | Repay borrowed tokens, approving the pool automatically when needed. Pass `max` as the amount to clear the debt dust-exact: the approval covers the current debt plus a 0.1% interest buffer, and the pool pulls only what is owed. |
| [lending:set-collateral](src/commands/set-collateral.md) | Enable or disable a supplied token as collateral for the connected account's borrows. |
| [lending:set-emode](src/commands/set-emode.md) | Set the connected account's efficiency-mode category, unlocking higher LTV between correlated assets (e.g. stablecoins). Category 0 disables e-mode. |
| [lending:supply](src/commands/supply.md) | Supply a token to a lending market, approving the pool automatically when needed. Supplied tokens earn interest and can back borrows as collateral. |
| [lending:withdraw](src/commands/withdraw.md) | Withdraw a supplied token from a lending market. Pass `max` as the amount to withdraw the full balance, accrued interest included. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@lending:apy](src/helpers/apy.md) | `number` | Current APY of a lending-market reserve as a decimal fraction (2.04% -> 0.0204). Pass `supply` for the deposit rate or `borrow` for the variable borrow rate. |
| [@lending:debt](src/helpers/debt.md) | `number` | Current variable-rate debt of an account in a token, in base units (grows every block as interest accrues). |
| [@lending:healthFactor](src/helpers/healthFactor.md) | `number` | Health factor of an account's lending position, 1e18-scaled (below 1e18 the position is liquidatable; uint256.max when the account has no debt). Composes with assertions: assert @lending:healthFactor(@me) >= 1.5e18. |
| [@lending:maxBorrow](src/helpers/maxBorrow.md) | `number` | How much of a token an account can still borrow against its current collateral, in base units of the token. |

