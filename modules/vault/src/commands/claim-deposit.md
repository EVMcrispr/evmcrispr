---
title: "vault:claim-deposit"
---

Claim the shares of a fulfilled ERC-7540 deposit request. Pass `max` as the amount to claim everything claimable. By default the amount is exact assets; pass --exact shares to claim an exact amount of shares instead.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
vault:claim-deposit <amount> <from> <vault>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `amount` | `command \| number` | Runtime in smart blocks | Amount to claim in base units (wei) — assets by default, shares with --exact shares — or the keyword `max` for everything claimable |
| `from` | `command` | Build time | Keyword `from` |
| `vault` | `address` | Build time | ERC-7540 vault address |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--to` | `address` | Runtime in smart blocks | Receiver of the claimed shares (defaults to the connected account) |
| `--controller` | `address` | Runtime in smart blocks | Controller of the request being claimed (defaults to the connected account; requires operator rights when it is not the sender) |
| `--request-id` | `number` | Runtime in smart blocks | Request id, for vaults that key requests by id (defaults to 0, the controller-keyed convention) |
| `--exact` | `string` | Build time | Which amount is exact: `assets` (default, uses deposit) or `shares` (uses mint) |

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
