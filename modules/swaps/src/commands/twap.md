---
title: "swaps:twap"
---

Sell tokens in equal timed parts through CoW from a reusable Safe controlled by @sender. Requires --parts, --every and exactly one of --min or --price-protection. Live preflight is required unless --offline is explicit.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: build-time inputs only. Order scheduling, hashing and signed/offline order artifacts require concrete amounts and bounds.

## Syntax

```evml
swaps:twap <variable> <amount> <tokenIn> <to> <tokenOut>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `variable` | `variable` | Build time | Variable to bind the order hash to |
| `amount` | `command \| number` | Build time | Total sell amount in base units, or the keyword `max` for the funder's whole balance; rounded down to a multiple of --parts, the remainder stays with the funder |
| `tokenIn` | `address` | Build time | ERC-20 token to sell |
| `to` | `command` | Build time | Keyword `to` |
| `tokenOut` | `address` | Build time | ERC-20 token to buy |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--parts` | `number` | Build time | Required number of equal parts (at least 2) |
| `--every` | `number` | Build time | Required seconds between parts (1 to 31536000) |
| `--min` | `number` | Build time | Total minimum output if all parts fill; rounded up per part (exclusive with --price-protection) |
| `--price-protection` | `number` | Build time | Maximum decrease from a fresh per-part quote, in percent (0 to 99.99, exact basis points); freezes a fixed price limit |
| `--offline` | `bool` | Build time | Skip external quote, valuation and service checks; requires --min and is mandatory inside sim:fork |
| `--using` | `twap-venue` | Build time | TWAP provider (default: CoWSwap) |
| `--start` | `number` | Build time | Unix start timestamp; omitted or 0 starts when the registration transaction is mined |
| `--window` | `number` | Build time | Validity of each part in seconds; omitted or 0 uses the full interval |
| `--to` | `address` | Build time | Recipient of bought tokens (default: @sender) |
| `--salt` | `bytes32` | Build time | Order salt (default: fresh random bytes32) |

## Errors

Failures this command declares. Capture them by name with the refusal arrows `-?/>` or `-/>` — see [Refusal captures](/language/captures/#refusal-captures).

| Error | Description |
|-------|-------------|
| `SameToken()` | The sell and buy token are the same |
| `NoBalance()` | The funder holds none of the sell token |
| `Unfunded(uint256)` | The sell amount is below the requested number of parts, so a part would sell nothing |
| `BelowMinimum(uint256)` | A part is worth less than the network's minimum order value |
| `NoQuote()` | CoW declines to quote this token or order under a documented rejection code |

**`Unfunded(uint256)` fields**

| # | Field | Type | Description |
|---|-------|------|-------------|
| 1 | `parts` | `number` | Parts the order asks for, and its minimum base units |

**`BelowMinimum(uint256)` fields**

| # | Field | Type | Description |
|---|-------|------|-------------|
| 1 | `minimum` | `number` | Minimum value per part, in USDC base units |

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
per token.

An order the command deliberately will not create fails before any action
exists, under one of the names in **Errors** above: `SameToken` for the buy
token itself, `NoBalance` for a token the funder does not hold, `Unfunded` for
an amount below `--parts` base units, `BelowMinimum` for a part below the
network's minimum order value, and `NoQuote` when CoW declines to quote the
token or the order. Capturing those names skips exactly those orders and lets
everything else — a mistyped option, an RPC outage, a quote that does not
verify — stop the script. Together with [@token:holdings](../../../token/src/helpers/holdings.md)
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
    swaps:twap $order max $token to $usdc --parts 4 --every 1800 --price-protection 1 -?/> SameToken -?/> BelowMinimum -?/> NoBalance -?/> Unfunded -?/> NoQuote
  )
)
```

A refusal carries its fields, so a script can read the limit it missed:

```evml
load swaps
swaps:twap $order 12e18 @token(WXDAI) to @token(GNO) --parts 3 --every 3600 --price-protection 1 -?/> BelowMinimum [$minimum]
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

`NoQuote` is raised only for the documented rejection codes with which CoW
declines to quote a token or an order — `NoLiquidity`, `InsufficientLiquidity`,
`UnsupportedToken` and `SellAmountDoesNotCoverFee` in its
[orderbook API](https://github.com/cowprotocol/services/blob/main/crates/orderbook/openapi.yml).
An unknown code, a server error, a timeout, a malformed response, an
unavailable valuation, a temporarily suspended token and a quote that does not
verify or does not match the requested order are **not** declared: they stop
the script even under a `-?/> NoQuote` capture.

```evml
load swaps
swaps:twap $order 12e18 @token(WXDAI) to @token(GNO) --parts 3 --every 3600 --price-protection 0.50
```

Protection accepts 0–99.99 percent in exact basis points. Each part's minimum is
`ceil(quotedNetBuyAmount × (10000 − protectionBps) / 10000)`. That fixed minimum
is encoded on-chain; it does not follow later prices. A fixed `--min` above the
quote is permitted with a
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

Execution Safes use the canonical Safe v1.5.0 L2 singleton. Their fallback
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

## The order hash

`$order` is bound to the order's **hash** (a `bytes32`); `print $order` shows
it. The order's status box links to the execution Safe's page on CoW Explorer,
where the parts appear as CoW's watchtower submits them. The hash is the only
thing `@swaps:twapStatus`, `@swaps:twapParts`, `swaps:twap-cancel` and
`swaps:twap-recover` take. In another session, set it again with
`set $order <the hash>` and switch to the order's chain.

Everything else is read back from the chain. The lookup asks CoW's
programmatic-order indexer first; an order it has not indexed yet, or any
order while it is unavailable, is found by scanning roughly the last six hours
of blocks. Either way the result is verified on-chain before use: the
parameters must hash to the order, the registration event must be in a
successful transaction, and the execution Safe must be one `swaps:twap`
derives from its controller. An order that is older than six hours and missing
from the indexer cannot be found. Within the script that created it, the hash
resolves before the registration is mined. A successful encoding or proposal
is not proof that the order was registered.

`--salt` makes order encoding reproducible. Otherwise a cryptographically random
salt distinguishes otherwise identical orders. The same conditional order is
not recreated in a previously used execution account.

## Following the order

In the terminal and the CLI, the order shows as a status box that follows
it to the end: *Waiting for execution → Started, part 1 of 4 at 14:05 UTC →
1/4 executed → … → Finished: 4/4 executed*. It links to the execution Safe's
orders, to the current part and to each settlement on CoW Explorer. The run
stays open until the schedule ends; Cancel stops following, never the
order. An order that expires with parts unfilled ends as *Ended: 3/4
executed, 1 expired*, and one removed with `swaps:twap-cancel` ends
cancelled (⊘) as *Cancelled on-chain after 1/4 executed*. When the order
ended but its fill history is still incomplete, the box reads *Ended;
confirming fills…* for a few more polls before giving the count or saying
it could not be verified. Inside a Safe proposal the box waits for the
Safe to execute it; a rejected, reverted or replaced transaction ends it
as *Not registered*. When the registration left the run without an
outcome to follow (queued in a Safe, or sent by a host that returned no
receipt), the box ends with that reason and a pointer to
[@swaps:twapStatus](../helpers/twapStatus.md); a dry run ends as
*Prepared, not sent*. Inside `sim:fork` it ends at once as registered,
since forks do not execute parts.

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
these separately. API outages do not prevent on-chain cancellation or recovery
of an order registered in the last six hours.
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
