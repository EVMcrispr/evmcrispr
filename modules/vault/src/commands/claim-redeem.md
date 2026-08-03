---
title: "vault:claim-redeem"
---

Claim the assets of a fulfilled ERC-7540 redemption request. Pass `max` as the amount to claim everything claimable. By default the amount is exact shares; pass --exact assets to claim an exact amount of assets instead.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
vault:claim-redeem <amount> <from> <vault>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amount` | `command \| number` | Amount to claim in base units (wei) — shares by default, assets with --exact assets — or the keyword `max` for everything claimable |
| `from` | `command` | Keyword `from` |
| `vault` | `address` | ERC-7540 vault address |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--to` | `address` | Receiver of the claimed assets (defaults to the connected account) |
| `--controller` | `address` | Controller of the request being claimed (defaults to the connected account; requires operator rights when it is not the sender) |
| `--request-id` | `number` | Request id, for vaults that key requests by id (defaults to 0, the controller-keyed convention) |
| `--exact` | `string` | Which amount is exact: `shares` (default, uses redeem) or `assets` (uses withdraw) |

## Examples

```evml
# Claim the assets of a fulfilled redemption request on the Centrifuge JTRSY vault
load vault

switch mainnet
vault:claim-redeem 100e6 from 0xFE6920eB6C421f1179cA8c8d4170530CDBdfd77A
```

<!-- HAND-WRITTEN -->

## Notes

Claims the assets of a redemption request that has already been fulfilled. By default the amount is an exact quantity of **shares** (the ERC-7540 `redeem(shares, receiver, controller)` overload, with the controller in the owner slot); pass `--exact assets` to claim an exact quantity of assets via the `withdraw` overload instead.

`max` reads the claimable amount for the controller: `claimableRedeemRequest(requestId, controller)` in shares mode, `maxWithdraw(controller)` in assets mode (the request id does not apply there). Claiming for a `--controller` other than the connected account requires being approved as its operator first (`vault:set-operator`).

## See Also

- [vault:request-redeem](./request-redeem.md)
- [vault:claim-deposit](./claim-deposit.md)
- [vault:set-operator](./set-operator.md)
- [@vault:claimableRedeem](../helpers/claimableRedeem.md)
