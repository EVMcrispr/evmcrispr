---
title: "vault:request-redeem"
---

Request a redemption of shares from an ERC-7540 asynchronous vault. Pass `max` as the amount to request the full share balance. The shares are taken immediately; claim the assets with vault:claim-redeem once the request is fulfilled.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
vault:request-redeem <shares> <of> <vault>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `shares` | `command \| number` | Amount of vault shares to redeem in base units (wei), or the keyword `max` for the full balance |
| `of` | `command` | Keyword `of` |
| `vault` | `address` | ERC-7540 vault address |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--controller` | `address` | Controller of the request, entitled to claim it (defaults to the connected account) |

## Examples

```evml
# Request a redemption of 100 JTRSY shares from the Centrifuge vault on Ethereum
load vault

switch mainnet
vault:request-redeem 100e6 of 0xFE6920eB6C421f1179cA8c8d4170530CDBdfd77A
```

<!-- HAND-WRITTEN -->

## Notes

The shares are taken from the connected account as soon as the request executes; the assets become claimable with `vault:claim-redeem` after an off-chain actor fulfills the request. No share approval is needed — ERC-7540 lets the vault take the sender's own shares directly.

On ERC-7575 vaults the share balance for `max` is read from the external share token (`@vault:share`), not from the vault address.

## See Also

- [vault:claim-redeem](./claim-redeem.md)
- [vault:request-deposit](./request-deposit.md)
- [@vault:pendingRedeem](../helpers/pendingRedeem.md)
- [@vault:claimableRedeem](../helpers/claimableRedeem.md)
- [@vault:share](../helpers/share.md)
