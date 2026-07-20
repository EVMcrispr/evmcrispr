---
title: "giveth:donate"
---

Donate a token to a Giveth project through the Giveth DonationHandler, approving it automatically when needed. The zero address (@token(ETH), @token(XDAI)...) donates the chain's native token. Wrap several donates in std batch to donate to many projects in one transaction.

## Syntax

```evml
giveth:donate <amount> <token> <to> <slug>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amount` | `number` | Donation amount in token base units |
| `token` | `address` | Token to donate (use @token(SYM); the native token resolves to the zero address) |
| `to` | `command` | Keyword `to` |
| `slug` | `string` | Giveth project URL slug |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--tip` | `number` | Extra donation to Giveth itself as a percentage of the amount (0-100), added on top and sent in the same transaction |
| `--no-approve` | `bool` | Skip the automatic allowance check and approve action |

## Examples

```evml
# Donate 100 GIV to a Giveth project
set $std:tokenlist https://tokens.honeyswap.org
giveth:donate 100e18 @token(GIV) to evmcrispr

# Donate native xDAI with a 5% tip to Giveth on top
giveth:donate 10e18 @token(XDAI) to evmcrispr --tip 5

# Donate to several projects in one transaction
set $std:tokenlist https://tokens.honeyswap.org
batch (
  giveth:donate 100e18 @token(GIV) to evmcrispr
  giveth:donate 50e18 @token(GIV) to the-giveth-community-of-makers
)
```

<!-- HAND-WRITTEN -->

## Attribution

Donations go through Giveth's DonationHandler contract, which emits an
on-chain `DonationMade` event per recipient. The project must have a
recipient address on the current chain (see
[@giveth:project](../helpers/project.md)); the handler is deployed on
Mainnet, Gnosis, Polygon, Optimism, Arbitrum, Base and Celo.

For recurring donations, stream to the project's anchor contract instead —
see [@giveth:anchor](../helpers/anchor.md).

## See Also

- [@giveth:project](../helpers/project.md)
- [@giveth:anchor](../helpers/anchor.md)
