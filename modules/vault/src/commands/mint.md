---
title: "vault:mint"
---

Mint an exact amount of ERC-4626 vault shares, approving the vault for the required assets (previewMint, which rounds up) automatically when needed.

## Syntax

```evml
vault:mint <shares> <of> <vault>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `shares` | `number` | Amount of vault shares to mint, in base units (wei) |
| `of` | `command` | Keyword `of` |
| `vault` | `address` | ERC-4626 vault address |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--to` | `address` | Receiver of the minted shares (defaults to the connected account) |
| `--no-approve` | `bool` | Skip the automatic allowance check and approve action |

## Examples

```evml
# Mint exactly 100 sDAI shares, approving previewMint worth of WXDAI
vault:mint 100e18 of 0xaf204776c7245bF4147c2612BF6e5972Ee483701
```

<!-- HAND-WRITTEN -->

## See Also
