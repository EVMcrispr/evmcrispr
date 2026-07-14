---
title: "vault:request-deposit"
---

Request a deposit into an ERC-7540 asynchronous vault, approving the vault automatically when needed. The assets are taken immediately; claim the shares with vault:claim-deposit once the request is fulfilled.

## Syntax

```evml
vault:request-deposit <assets> <into> <vault>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `assets` | `number` | Amount of the underlying asset to deposit, in base units (wei) |
| `into` | `command` | Keyword `into` |
| `vault` | `address` | ERC-7540 vault address |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--controller` | `address` | Controller of the request, entitled to claim it (defaults to the connected account) |
| `--no-approve` | `bool` | Skip the automatic allowance check and approve action |

## Examples

```evml
# Request a deposit of 1000 USDC into the Centrifuge JTRSY vault on Ethereum (auto-approves)
load vault

switch mainnet
vault:request-deposit 1000e6 into 0xFE6920eB6C421f1179cA8c8d4170530CDBdfd77A

# Request a deposit for another controller, who will claim the shares
load vault

switch mainnet
vault:request-deposit 1000e6 into 0xFE6920eB6C421f1179cA8c8d4170530CDBdfd77A --controller 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
```

<!-- HAND-WRITTEN -->

## The asynchronous flow

ERC-7540 vaults (Centrifuge and other RWA vaults) settle deposits in two steps: the request escrows your assets immediately, an off-chain actor fulfills it later, and only then can the shares be claimed. `preview*` functions revert on asynchronous vaults, so there is no way to quote the share amount upfront.

Wait for fulfillment and claim in one long-running script:

```evml
load vault
load std

switch mainnet
vault:request-deposit 1000e6 into 0xFE6920eB6C421f1179cA8c8d4170530CDBdfd77A
loop until @bool(@vault:claimableDeposit(0xFE6920eB6C421f1179cA8c8d4170530CDBdfd77A) > 0) (
  wait 60s
)
vault:claim-deposit max from 0xFE6920eB6C421f1179cA8c8d4170530CDBdfd77A
```

The `--controller` becomes the account entitled to track and claim the request. Most vaults key requests purely by controller (request id `0`); synchronous ERC-4626 vaults reject this command — use `vault:deposit` there instead.

## See Also

- [vault:claim-deposit](./claim-deposit.md)
- [vault:request-redeem](./request-redeem.md)
- [vault:set-operator](./set-operator.md)
- [@vault:pendingDeposit](../helpers/pendingDeposit.md)
- [@vault:claimableDeposit](../helpers/claimableDeposit.md)
