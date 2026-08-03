---
title: "vault:deposit"
---

Deposit an exact amount of the underlying asset into an ERC-4626 vault, approving the vault automatically when needed. Works with any 4626-compliant vault such as sDAI, Morpho or Yearn v3. For ERC-7540 asynchronous vaults use vault:request-deposit instead.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
vault:deposit <assets> <into> <vault>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `assets` | `number` | Amount of the underlying asset to deposit, in base units (wei) |
| `into` | `command` | Keyword `into` |
| `vault` | `address` | ERC-4626 vault address |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--to` | `address` | Receiver of the minted shares (defaults to the connected account) |
| `--no-approve` | `bool` | Skip the automatic allowance check and approve action |

## Examples

```evml
# Deposit 100 WXDAI into the sDAI vault on Gnosis (auto-approves)
vault:deposit 100e18 into 0xaf204776c7245bF4147c2612BF6e5972Ee483701

# Deposit 1000 USDC into the Steakhouse USDC Morpho vault on Ethereum
load vault

switch mainnet
vault:deposit 1000e6 into 0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB

# Import the command to drop the vault: prefix
load vault [deposit]

deposit 100e18 into 0xaf204776c7245bF4147c2612BF6e5972Ee483701
```

<!-- HAND-WRITTEN -->

## See Also
