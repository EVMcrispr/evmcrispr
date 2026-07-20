---
title: "giveth:donate"
---

Donate to Giveth projects and record the donation in Giveth's database (project totals, GIVbacks). A single project gets a direct wallet transfer; several projects ([amounts] to [slugs]) donate through the DonationHandler contract in one transaction. Signs you in to Giveth (SIWE) and sends the transactions immediately to report their hashes, so it cannot be batched. The zero address (@token(ETH), @token(XDAI)...) donates the chain's native token.

## Syntax

```evml
giveth:donate <amount> <token> <to> <projects>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amount` | `array \| number` | Donation amount in token base units, or one amount per project (a single amount with several projects donates that amount to each) |
| `token` | `address` | Token to donate (use @token(SYM); the native token resolves to the zero address) |
| `to` | `command` | Keyword `to` |
| `projects` | `array \| string` | Giveth project URL slug, or several slugs |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--tip` | `number` | Extra donation to Giveth itself as a percentage of the total amount (0-100), added on top |
| `--anonymous` | `bool` | Hide your identity on the recorded donation |
| `--no-approve` | `bool` | Skip the automatic allowance check and approve action |

<!-- HAND-WRITTEN -->

## Examples

```evml
# Donate 100 GIV to one project (direct wallet transfer)
set $std:tokenlist https://tokens.honeyswap.org
giveth:donate 100e18 @token(GIV) to evmcrispr

# Donate native xDAI with a 5% tip to Giveth on top
giveth:donate 10e18 @token(XDAI) to evmcrispr --tip 5

# Donate to several projects in one DonationHandler transaction
set $std:tokenlist https://tokens.honeyswap.org
giveth:donate [100e18 50e18] @token(GIV) to [evmcrispr wayback-machine]

# Same amount to each project
giveth:donate 10e18 @token(XDAI) to [evmcrispr wayback-machine]
```

## How it works

Both shapes mirror Giveth's own frontends: giveth.io sends direct transfers,
qf.giveth.io batches through the DonationHandler contract — and in both
cases the frontend must report the donation to Giveth's API afterwards,
because nothing indexes the chain on its own. A donation that skips the API
call never shows up in project totals, GIVbacks or QF matching.

That report needs the transaction hash and an authenticated user, so the
command signs you in with a Sign-In-With-Ethereum message (one wallet
signature per run), executes the transactions immediately, waits for
confirmation, and calls `createDonation` for every project with the
resulting hash. This is why `donate` cannot go inside `batch` or a Safe.
Inside `sim:fork` the transactions simulate on the fork and the sign-in and
database recording are skipped, so simulated donations are never reported
to Giveth.

The project must have a recipient address on the current chain (see
[@giveth:project](../helpers/project.md)); the DonationHandler is deployed
on Mainnet, Gnosis, Polygon, Optimism, Arbitrum, Base and Celo, while
direct donations work on any chain the project has an address for.

For recurring donations, stream to the project's anchor contract instead —
see [@giveth:anchor](../helpers/anchor.md).

## See Also

- [@giveth:project](../helpers/project.md)
- [@giveth:anchor](../helpers/anchor.md)
- [giveth:boost](boost.md)
