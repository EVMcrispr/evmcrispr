---
title: "vault:mint"
---

Mint an exact amount of ERC-4626 vault shares, approving the vault for the required assets (previewMint, which rounds up) automatically when needed. For ERC-7540 asynchronous vaults use vault:request-deposit instead.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
vault:mint <shares> <of> <vault>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `shares` | `number` | Runtime in smart blocks | Amount of vault shares to mint, in base units (wei) |
| `of` | `command` | Build time | Keyword `of` |
| `vault` | `address` | Build time | ERC-4626 vault address |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--to` | `address` | Runtime in smart blocks | Receiver of the minted shares (defaults to the connected account) |
| `--no-approve` | `bool` | Build time | Skip the automatic allowance check and approve action |

## Examples

```evml
# Mint exactly 100 sDAI shares, approving previewMint worth of WXDAI
vault:mint 100e18 of 0xaf204776c7245bF4147c2612BF6e5972Ee483701
```

<!-- HAND-WRITTEN -->

## See Also
