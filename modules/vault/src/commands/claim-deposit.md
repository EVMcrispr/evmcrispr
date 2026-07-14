---
title: "vault:claim-deposit"
---

Claim the shares of a fulfilled ERC-7540 deposit request. Pass `max` as the amount to claim everything claimable. By default the amount is exact assets; pass --exact shares to claim an exact amount of shares instead.

## Syntax

```evml
vault:claim-deposit <amount> <from> <vault>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amount` | `command \| number` | Amount to claim in base units (wei) — assets by default, shares with --exact shares — or the keyword `max` for everything claimable |
| `from` | `command` | Keyword `from` |
| `vault` | `address` | ERC-7540 vault address |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--to` | `address` | Receiver of the claimed shares (defaults to the connected account) |
| `--controller` | `address` | Controller of the request being claimed (defaults to the connected account; requires operator rights when it is not the sender) |
| `--request-id` | `number` | Request id, for vaults that key requests by id (defaults to 0, the controller-keyed convention) |
| `--exact` | `string` | Which amount is exact: `assets` (default, uses deposit) or `shares` (uses mint) |

## Examples

```evml
# Claim the shares of a fulfilled deposit request on the Centrifuge JTRSY vault
load vault

switch mainnet
vault:claim-deposit 1000e6 from 0xFE6920eB6C421f1179cA8c8d4170530CDBdfd77A --to @me
```

<!-- HAND-WRITTEN -->

## Notes

Claims the shares of a deposit request that has already been fulfilled. By default the amount is an exact quantity of **assets** (the ERC-7540 `deposit(assets, receiver, controller)` overload); pass `--exact shares` to claim an exact quantity of shares via the `mint` overload instead.

`max` reads the claimable amount for the controller: `claimableDepositRequest(requestId, controller)` in assets mode, `maxMint(controller)` in shares mode (the request id does not apply there). Claiming for a `--controller` other than the connected account requires being approved as its operator first (`vault:set-operator`).

## See Also

- [vault:request-deposit](./request-deposit.md)
- [vault:claim-redeem](./claim-redeem.md)
- [vault:set-operator](./set-operator.md)
- [@vault:claimableDeposit](../helpers/claimableDeposit.md)
