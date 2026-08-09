# vault module

ERC-4626 tokenized vaults: deposit, mint, withdraw and redeem (with `max` sugar) with automatic approvals, plus share/asset conversion and inspection helpers. Works with any 4626-compliant vault — sDAI, Morpho (MetaMorpho), Yearn v3 and more. Also supports ERC-7540 asynchronous vaults (request/claim flows, operators) and ERC-7575 multi-asset vaults with external share tokens, such as Centrifuge.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

```evml
load vault
```

## Commands

| Command | Description |
|---------|-------------|
| [vault:claim-deposit](src/commands/claim-deposit.md) | Claim the shares of a fulfilled ERC-7540 deposit request. Pass `max` as the amount to claim everything claimable. By default the amount is exact assets; pass --exact shares to claim an exact amount of shares instead. |
| [vault:claim-redeem](src/commands/claim-redeem.md) | Claim the assets of a fulfilled ERC-7540 redemption request. Pass `max` as the amount to claim everything claimable. By default the amount is exact shares; pass --exact assets to claim an exact amount of assets instead. |
| [vault:deposit](src/commands/deposit.md) | Deposit an exact amount of the underlying asset into an ERC-4626 vault, approving the vault automatically when needed. Works with any 4626-compliant vault such as sDAI, Morpho or Yearn v3. For ERC-7540 asynchronous vaults use vault:request-deposit instead. |
| [vault:mint](src/commands/mint.md) | Mint an exact amount of ERC-4626 vault shares, approving the vault for the required assets (previewMint, which rounds up) automatically when needed. For ERC-7540 asynchronous vaults use vault:request-deposit instead. |
| [vault:redeem](src/commands/redeem.md) | Redeem an exact amount of ERC-4626 vault shares for the underlying asset. Pass `max` as the amount to redeem the full share balance. For ERC-7540 asynchronous vaults use vault:request-redeem instead. |
| [vault:request-deposit](src/commands/request-deposit.md) | Request a deposit into an ERC-7540 asynchronous vault, approving the vault automatically when needed. The assets are taken immediately; claim the shares with vault:claim-deposit once the request is fulfilled. |
| [vault:request-redeem](src/commands/request-redeem.md) | Request a redemption of shares from an ERC-7540 asynchronous vault. Pass `max` as the amount to request the full share balance. The shares are taken immediately; claim the assets with vault:claim-redeem once the request is fulfilled. |
| [vault:set-operator](src/commands/set-operator.md) | Approve (default) or revoke an operator on an ERC-7540 vault. Operators can request and claim on behalf of the connected account. |
| [vault:withdraw](src/commands/withdraw.md) | Withdraw an exact amount of the underlying asset from an ERC-4626 vault, burning the required shares. Pass `max` as the amount to withdraw everything available. For ERC-7540 asynchronous vaults use vault:request-redeem instead. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@vault:asset](src/helpers/asset.md) | `address` | Underlying asset token address of an ERC-4626 vault. As @asset! the asset() read happens on-chain at assertion time. |
| [@vault:claimableDeposit](src/helpers/claimableDeposit.md) | `number` | Assets of a fulfilled deposit request claimable from an ERC-7540 vault, in base units of the asset. As @claimableDeposit! the claimableDepositRequest read happens on-chain at assertion time. |
| [@vault:claimableRedeem](src/helpers/claimableRedeem.md) | `number` | Shares of a fulfilled redemption request claimable from an ERC-7540 vault, in base units of the share. As @claimableRedeem! the claimableRedeemRequest read happens on-chain at assertion time. |
| [@vault:convertToAssets](src/helpers/convertToAssets.md) | `number` | Amount of underlying assets an ERC-4626 vault would return for a given amount of shares, in base units of the asset. As @convertToAssets! the conversion is read on-chain at assertion time — the shares argument may itself be a live call. |
| [@vault:convertToShares](src/helpers/convertToShares.md) | `number` | Amount of shares an ERC-4626 vault would mint for a given amount of underlying assets, in base units of the share token. As @convertToShares! the conversion is read on-chain at assertion time — the assets argument may itself be a live call. |
| [@vault:isOperator](src/helpers/isOperator.md) | `bool` | Whether an account is an approved operator of a controller on an ERC-7540 vault. As @isOperator! the read happens on-chain at assertion time. |
| [@vault:maxWithdraw](src/helpers/maxWithdraw.md) | `number` | Maximum amount of underlying assets an account can withdraw from an ERC-4626 vault, in base units of the asset. As @maxWithdraw! the read happens on-chain at assertion time (the owner still defaults to the connected account at composition time). |
| [@vault:pendingDeposit](src/helpers/pendingDeposit.md) | `number` | Assets of a pending (not yet fulfilled) deposit request on an ERC-7540 vault, in base units of the asset. As @pendingDeposit! the pendingDepositRequest read happens on-chain at assertion time. |
| [@vault:pendingRedeem](src/helpers/pendingRedeem.md) | `number` | Shares of a pending (not yet fulfilled) redemption request on an ERC-7540 vault, in base units of the share. As @pendingRedeem! the pendingRedeemRequest read happens on-chain at assertion time. |
| [@vault:share](src/helpers/share.md) | `address` | Share token address of a vault. ERC-7575 vaults expose a separate share token; plain ERC-4626 vaults are their own share token, so the vault address itself is returned. As @share! the share() read happens on-chain at assertion time, falling back to the vault address itself through the core's orElse when share() is absent (plain ERC-4626). |
| [@vault:totalAssets](src/helpers/totalAssets.md) | `number` | Total amount of underlying assets managed by an ERC-4626 vault, in base units of the asset. As @totalAssets! the read happens on-chain at assertion time. |

