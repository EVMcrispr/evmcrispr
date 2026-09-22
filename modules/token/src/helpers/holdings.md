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

## Errors

Failures this helper declares. It raises them while a command line evaluates its arguments, so the command line captures them with `-?!>` or `-!>` — see [Event & Error Captures](/language/captures/).

| Error | Description |
|-------|-------------|
| `NoExplorer(uint256)` | The chain has no explorer that can list an account's tokens |

**`NoExplorer(uint256)` fields**

| # | Field | Type | Description |
|---|-------|------|-------------|
| 1 | `chainId` | `number` | Chain that was asked |

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
refuses on its own, and capturing that command's own error names turns the
refusal into a skip.

The explorer indexes a few blocks behind the chain, so the helper returns
addresses only. Read the amount you are about to spend live, from the chain —
with `@balance`, or a command's own `max` keyword:

```evml
load token
load swaps

set $usdc @token(USDC)

loop $token of @token:holdings(@me) (
  swaps:twap $order max $token to $usdc --parts 4 --every 1800 --price-protection 1 -?!> SameToken -?!> BelowMinimum -?!> NoBalance -?!> Unfunded -?!> NoQuote
)
```

The helper reads chain state, so inside a block that collects its calls
(`safe:execute`, `batch`) read it into a variable above the block first.

## Chains without an explorer

Only a chain with a Blockscout instance can answer at all. On any other
chain the helper refuses with `NoExplorer`, and the command line that
evaluates it captures that refusal by name:

```evml
load token

set $tokens [0x1111111111111111111111111111111111111111]
set $tokens @token:holdings(@me) -?!> NoExplorer $unsupported
```

A captured refusal gives the line no value: the `set` does not happen, so
`$tokens` keeps whatever it already held — here the list above it — and
`$unsupported` is `true`. A successful lookup clears that flag and assigns
the list, the empty one included: an account holding no ERC-20 is an answer,
not a refusal. Decide what an unsupported chain should mean before capturing
it; a loop that keeps going over a stale list is rarely what you meant.

`-!>` requires the refusal instead of permitting it, and its field says
which chain was asked:

```evml
load token

set $tokens @token:holdings(@me bsc) -!> NoExplorer [$chain]
```

`NoExplorer` means only that: the chain has no explorer to ask. An explorer
that cannot be reached, answers with an error status, or returns something
other than a token list is an outage — an ordinary failure that stops the
script, which no capture silences. An outage is not an empty wallet.

## See Also

- [@balance](../../../std/src/helpers/balance.md) — live balance of one token
- [@token:symbol](symbol.md) — symbol of a returned address
- [@receipts:txs](../../../receipts/src/helpers/txs.md) — the address's recent transactions, from the same explorer
