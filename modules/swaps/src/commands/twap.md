---
title: "swaps:twap"
---

Sell tokens in equal timed parts through CoW from a reusable Safe controlled by @sender. Requires --parts, --every and exactly one of --min or --price-protection. Live preflight is required unless --offline is explicit.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
swaps:twap <variable> <amount> <tokenIn> <to> <tokenOut>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `variable` | `variable` | Variable to bind the order reference to |
| `amount` | `command \| number` | Total sell amount in base units, or the keyword `max` for the funder's whole balance; rounded down to a multiple of --parts, the remainder stays with the funder |
| `tokenIn` | `address` | ERC-20 token to sell |
| `to` | `command` | Keyword `to` |
| `tokenOut` | `address` | ERC-20 token to buy |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--parts` | `number` | Required number of equal parts (at least 2) |
| `--every` | `number` | Required seconds between parts (1 to 31536000) |
| `--min` | `number` | Total minimum output if all parts fill; rounded up per part (exclusive with --price-protection) |
| `--price-protection` | `number` | Maximum decrease from a fresh per-part quote, in percent (0 to 99.99, exact basis points); freezes a fixed price limit |
| `--offline` | `bool` | Skip external quote, valuation and service checks; requires --min and is mandatory inside sim:fork |
| `--using` | `twap-venue` | TWAP provider (default: CoWSwap) |
| `--start` | `number` | Unix start timestamp; omitted or 0 starts when the registration transaction is mined |
| `--window` | `number` | Validity of each part in seconds; omitted or 0 uses the full interval |
| `--to` | `address` | Recipient of bought tokens (default: @sender) |
| `--salt` | `bytes32` | Order salt (default: fresh random bytes32) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load swaps

# Sell 12 WXDAI in three hourly parts; each filled part buys at least 0.01 GNO.
swaps:twap $order 12e18 @token(WXDAI) to @token(GNO) --parts 3 --every 3600 --min 3e16 --using CoWSwap

print @swaps:twapStatus($order)
```

`--min` is the total minimum **if all parts fill**. It is divided by the number
of parts and rounded upward. Every part sells the same amount, so the sell
amount is rounded **down** to a multiple of the part count; the few base units
left over never leave the funder, and the log reports them. The keyword `max`
sells the funder's whole balance, read when the script builds — inside a Safe
block that is the balance before the block executes, so keep one `max` order
per token. An order the command cannot create — a part below the network
minimum, no quote for the token, the buy token itself — fails before any
action exists; `-?!> $skipped` catches that failure so a loop over several
tokens continues with the next one. Together with [@token:holdings](../../../token/src/helpers/holdings.md)
this sells everything a Safe holds in one transaction:

```evml
load safe
load swaps
load token

set $safe 0x1111111111111111111111111111111111111111
set $usdc @token(USDC)
set $tokens @token:holdings($safe)

safe:execute $safe (
  loop $token of $tokens (
    swaps:twap $order max $token to $usdc --parts 4 --every 1800 --price-protection 1 -?!> $skipped
  )
)
```

Parts are sell orders and cannot be partially filled.
A part that misses its price limit or trading window expires rather than
accumulating into the next part. The conditional total is not a promise that
every part executes.

## Live validation and price protection

Specify exactly one of `--min` or `--price-protection`. Online creation requires
a fresh, unexpired, verified CoW quote for **one part**, with the execution Safe
as its ERC-1271 owner and the selected recipient. Invalid quotes, unsupported
tokens, insufficient fee coverage, missing liquidity, unavailable valuations,
or unavailable service checks stop encoding before funding actions are returned.
This TWAP quote path does not change spot-swap quoting or wallet signing.

```evml
load swaps
swaps:twap $order 12e18 @token(WXDAI) to @token(GNO) --parts 3 --every 3600 --price-protection 0.50
```

Protection accepts 0–99.99 percent in exact basis points. Each part's minimum is
`ceil(quotedNetBuyAmount × (10000 − protectionBps) / 10000)`. That fixed minimum
is encoded on-chain; it does not follow later prices. The log reports the quote
timestamp and expiry, estimated fee and net output per part, enforced minimum,
and conditional total. A fixed `--min` above the quote is permitted with a
“currently unfillable” warning, since waiting for a better price is valid.

Online checks require intervals of at least five minutes and a minimum part
value of 1,000 USDC on Ethereum or 1 USDC on Gnosis, Polygon, Base, and Arbitrum.
Valuation uses CoW's native-token prices with rational arithmetic. These policies
are pinned to the [reviewed frontend revision](https://github.com/cowprotocol/cowswap/blob/ee249c2bf3a427765c602e83004f08a291c8d92f/apps/cowswap-frontend/src/modules/twap/const.ts).

For deliberate offline encoding, use **`--offline true --min <amount>`**.
Boolean options in this DSL take an explicit value. This mode skips external
quote, valuation, and service checks and prints that fact. Contract, schedule,
network allowlist, and account checks still run against the selected chain.
Inside `sim:fork`, offline mode is mandatory and no production CoW API is called.

```evml
load sim
load swaps
sim:fork --using anvil (
  sim:set-balance @me 100e18
  swaps:wrap 12e18
  swaps:twap $order 12e18 @token(WXDAI) to @token(GNO) --parts 3 --every 3600 --min 3e16 --offline true
)
```

The default start is the block that mines the registration transaction, not
the time the script is encoded or a proposal is signed. `--start` selects a fixed
Unix timestamp instead. `--window` limits each part's trading window; its default
of zero means the complete `--every` interval. All times are seconds.

## Wallets and DAOs

The controller, funder, and default recipient are `@sender`. At top level this
is the connected wallet. Within `safe:execute` or `safe:propose` it is the outer
Safe; within an Aragon forwarding block it is the final forwarding account.
That account must be able to execute arbitrary calls and hold the sell tokens.

```evml
load safe
load swaps
safe:propose 0x1111111111111111111111111111111111111111 (
  swaps:twap $order 12000e18 @token(DAI) to @token(WETH) --parts 12 --every 3600 --min 4e18
)
```

Each TWAP runs in a dedicated 1-of-1 Safe whose sole owner is its controller.
The command creates an execution Safe if needed, approves funding, and encodes
a Safe transaction that pulls the full sell amount, approves CoW's relayer, and
registers the order. Bought tokens go directly to `--to` or the controller.
The source wallet's fallback handler is not changed. Only ERC-20 tokens are
supported; use wrapped native tokens.

Execution Safes use the canonical Safe v1.4.1 L2 singleton. Their fallback
handler is CoW's ExtensibleFallbackHandler, with the CoW settlement domain
delegated to ComposableCoW. The TWAP command reads quotes and service data but
does not sign or submit child orders: it returns ordinary transaction actions,
so it works inside Safe/DAO batches and chain-fork simulations. CoW's watchtower observes
the registration event and submits the individual orders later. A successful
simulation demonstrates registration and validity, not future solver fills.

## Reuse and recovery

The command checks up to 32 deterministic account slots per controller and
chain. It reuses an idle account only when its proxy, singleton, sole owner,
threshold, fallback handler, domain verifier, modules, guards, and prior token
allowances match expectations. A live order or an uncleared allowance selects
another account. Separate commands in one interpretation reserve different
accounts, including when their transactions have not yet executed.

Reuse requires complete Safe execution and CoW order history, including archive
reads. Unknown calls, private orders, missing logs, or unavailable history make
an account ineligible. A fresh account is used instead. Completed or expired
orders should be cleaned up with `swaps:twap-recover`; an active schedule can
first be stopped with `swaps:twap-cancel`.

Compatibility is checked again after external API and history calls. Quotes
neither reserve liquidity nor validate future account state. Independently
prepared proposals do not reserve accounts on-chain.
Re-simulate delayed governance proposals immediately before execution, and
rebuild them if the account state has changed. Account configuration changes
can also prevent the convenience management commands from recognizing it;
its controller retains ordinary Safe control.

## Saving the order reference

`$order` is a JSON **string**, also printed by the command. Save the entire
string; it includes the chain, controller, execution account, and conditional
order parameters. To manage an order in another session, restore it with
`set $order '<the printed JSON>'` and switch to its original chain. A successful
encoding or proposal is not proof that the order was registered.

`--salt` makes order encoding reproducible. Otherwise a cryptographically random
salt distinguishes otherwise identical orders. The same conditional order is
not recreated in a previously used execution account.

## What each observation proves

| Observation | Meaning |
| --- | --- |
| Quote verification | CoW verified the quoted trade under the conditions observed then. |
| Registration | The conditional order is authorized on-chain. |
| Indexer discovery | The programmatic-order service has a matching parent record. |
| Submission | The orderbook has a matching child order; this does not prove settlement. |
| Settlement | A canonical CoW settlement receipt contains the exact part's `Trade` event. |
| Finality | The evidence is at or below the RPC's finalized block; otherwise pending or unknown. |

Use `@swaps:twapStatus($order)` and `@swaps:twapParts($order 0 100)` to inspect
these separately. API outages do not prevent on-chain cancellation or recovery.
There is no scheduler, automatic submission, or background monitor in EVMcrispr.
Neither a quote nor a successful simulation guarantees future liquidity,
watchtower availability, or execution of every part.

New creation is limited to the five networks above, with separate deployment
and observed-service evidence. Maintainers run
`bun modules/swaps/scripts/check-twap-services.ts` for an explicit read-only
release check. The support manifest records example registrations, fulfilled
ERC-1271 children, observation dates, and upstream revisions. Removing a network
from creation support preserves management of existing references. Bytecode
deployment alone is not service-availability evidence.

The integration remains experimental. Funding, reuse, and recovery require
independent security review; tests and upstream audits do not audit this integration.

## Protocol references

- [ComposableCoW architecture](https://docs.cow.fi/cow-protocol/reference/contracts/periphery/composable-cow)
- [TWAP order implementation](https://github.com/cowprotocol/composable-cow/blob/main/src/types/twap/libraries/TWAPOrder.sol)
- [Deployments and watchtower registration](https://github.com/cowprotocol/composable-cow#deployed-contracts)
