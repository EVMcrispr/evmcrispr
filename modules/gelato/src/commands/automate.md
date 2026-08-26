---
title: "gelato:automate"
---

Create a Gelato Automate task that calls a contract function on a trigger: --every <duration> (interval), --cron <expression>, --when <resolver> (an on-chain checker whose --check function returns whether and with what calldata to execute), --on <address> --event <signature> (event trigger), or --once (execute as soon as possible, a single time). With --function <cid> the task runs a published Web3 Function instead and executes the calls it returns. Every execution is sent from your dedicated msg.sender (@gelato:dedicatedMsgSender), so targets that restrict callers must allow that address. Executions are billed to your Gas Tank unless --pay names a fee token the target pays with.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
gelato:automate [target] [signature] [...params]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[target]` | `address` | Contract to call (omit with --function) |
| `[signature]` | `write-abi` | Function to call, e.g. rebalance() (omit with --function) |
| `[...params]` | `any` | Arguments matching the signature types |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--every` | `number` | Run on an interval, e.g. 5m, 1h, 1d |
| `--start` | `number` | Unix timestamp (seconds) of the first --every execution |
| `--cron` | `string` | Run on a cron schedule, e.g. "0 0 * * *" |
| `--when` | `address` | Resolver contract whose --check function decides when to execute |
| `--check` | `string` | Resolver function returning (bool canExec, bytes execPayload); default "checker()" |
| `--on` | `address` | Contract whose --event triggers the task |
| `--event` | `string` | Event signature, e.g. "Deposit(address,uint256)", or a topic hash |
| `--once` | `bool` | Execute a single time, then the task cancels itself |
| `--function` | `string` | CID of a published Web3 Function (see gelato:publish-function) to run instead of a fixed call |
| `--args` | `any` | Web3 Function user args as an entries array, e.g. [[vault 0x…] [threshold 100]] |
| `--pay` | `address` | Fee token the target contract pays executions with (sync fee) instead of your Gas Tank |

## Examples

```evml
# Rebalance a vault every hour, paid from your Gas Tank
gelato:automate 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 rebalance() --every 1h

# Let an on-chain checker decide when (and with what arguments) to harvest
gelato:automate 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 harvest(address) @me --when 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 --check "shouldHarvest()"

# React to deposits into a pool
gelato:automate 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 rebalance() --on 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 --event "Deposit(address,uint256)"
```

<!-- HAND-WRITTEN -->

## Notes

- Every task executes from your **dedicated msg.sender** (`@gelato:dedicatedMsgSender`),
  a proxy Gelato deploys for your account on first use: Automate no longer accepts
  tasks without it. Contracts that restrict callers (`onlyKeeper`, allowlists) must
  allow that address, not your wallet.
- `--every` takes a duration literal (`5m`, `1h`, `2d`); Automate stores intervals in
  milliseconds and the command converts. `--start` is a unix timestamp in seconds.
- `--when <resolver>` pins only the selector of `<signature>`: the resolver's `--check`
  function returns `(bool canExec, bytes execPayload)` and supplies the full calldata
  at execution time, so `[params]` are ignored for resolver tasks.
- `--function <cid>` needs no target: the Web3 Function returns the calls to make and
  they run through the dedicated msg.sender's `batchExecuteCall`. Without another
  trigger it runs every block. `--args` values are ABI-encoded against the schema the
  function was published with (`--user-args` of `gelato:publish-function`), fetched
  from Gelato's function store when the CID was not published in this script.
- Executions are billed to the Gas Tank of the task creator (`gelato:fund`) unless
  `--pay <token>` makes the target contract pay a sync fee
  (`0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` for the native token).
- Task ids are deterministic; read them back with `@gelato:tasks` / `@gelato:lastTask`
  and cancel with `gelato:cancel`.


## See Also
