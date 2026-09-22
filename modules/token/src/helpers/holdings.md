---
title: "@token:holdings"
experimental: true
sidebar:
  label: "@token:holdings ⚗️"
---

Addresses of the ERC-20 tokens an account holds with a nonzero balance, as indexed by the chain's explorer. Read live amounts with @balance before spending them. Needs a chain with a Blockscout instance: plain RPC cannot list what an address holds.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `array`

## Syntax

```evml
@token:holdings(address chain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `address` | `address` | Account to inspect |
| `[chain]` | `chain` | Chain to look on (default: current chain) |

## Examples

```evml
# List the ERC-20 tokens an account holds
set $tokens @token:holdings(0x1111111111111111111111111111111111111111)

# Look on another chain
set $tokens @token:holdings(0x1111111111111111111111111111111111111111 gnosis)
```

<!-- HAND-WRITTEN -->

The list comes from the chain's Blockscout instance (keyless), in the
explorer's order — by fiat value where it knows one. Only fungible tokens
with a nonzero indexed balance are returned; NFTs and multi-tokens are left
out. Airdropped spam tokens do appear, since the explorer cannot tell them
apart: a later command that has no use for them (no quote, no liquidity)
fails on its own, which `-?!>` turns into a skip.

The explorer indexes a few blocks behind the chain, so the helper returns
addresses only. Read the amount you are about to spend live, from the chain —
with `@balance`, or a command's own `max` keyword:

```evml
load token
load swaps

set $usdc @token(USDC)

loop $token of @token:holdings(@me) (
  swaps:twap $order max $token to $usdc --parts 4 --every 1800 --price-protection 1 -?!> $skipped
)
```

The helper reads chain state, so inside a block that collects its calls
(`safe:execute`, `batch`) read it into a variable above the block first.

## See Also

- [@balance](../../../std/src/helpers/balance.md) — live balance of one token
- [@token:symbol](symbol.md) — symbol of a returned address
- [@receipts:txs](../../../receipts/src/helpers/txs.md) — the address's recent transactions, from the same explorer
