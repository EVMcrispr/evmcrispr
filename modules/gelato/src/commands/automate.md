---
title: "gelato:automate"
---

Create a Gelato Automate task that executes the calls of a block on a trigger: --every <duration> (interval), --cron <expression>, --when <resolver> (an on-chain checker whose --check function returns whether and with what calldata to execute), --on <address> --event <signature> (event trigger), or --once (execute as soon as possible, a single time). The block is interpreted now and its calls are frozen into the task; several calls execute atomically through the dedicated msg.sender's batchExecuteCall. Inside the block @sender is your dedicated msg.sender (@gelato:dedicatedMsgSender), the address every execution comes from, so targets that restrict callers must allow it; @me stays your wallet. Executions are billed to your Gas Tank unless --pay names a fee token the target pays with.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
gelato:automate <block>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `block` | `block` | Commands whose calls the task executes |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--every` | `number` | Run on an interval, e.g. 5m, 1h, 1d |
| `--start` | `number` | Unix timestamp (seconds) of the first --every execution |
| `--cron` | `string` | Run on a cron schedule, e.g. "0 0 * * *" |
| `--on` | `address` | Contract whose --event triggers the task |
| `--event` | `string` | Event signature, e.g. "Deposit(address,uint256)", or a topic hash |
| `--once` | `bool` | Execute a single time, then the task cancels itself |
| `--when` | `address` | Resolver contract whose --check function decides when to execute (single-call blocks only) |
| `--check` | `string` | Resolver function returning (bool canExec, bytes execPayload); default "checker()" |
| `--pay` | `address` | Fee token the target contract pays executions with (sync fee) instead of your Gas Tank |

## Examples

```evml
# Rebalance a vault every hour, paid from your Gas Tank
gelato:automate --every 1h (
  exec 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 rebalance()
)

# Harvest and compound in one atomic execution every day; @sender is the dedicated msg.sender the calls come from
gelato:automate --every 1d (
  exec 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 harvest(address) @sender
  exec 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 compound()
)

# Let an on-chain checker decide when (and with what arguments) to harvest
gelato:automate --when 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 --check "shouldHarvest()" (
  exec 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 harvest(address) @sender
)

# React to deposits into a pool
gelato:automate --on 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 --event "Deposit(address,uint256)" (
  exec 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 rebalance()
)
```

<!-- HAND-WRITTEN -->

## Notes

- The block is interpreted **when the task is created**, as a static batch: its calls
  are frozen into the task and replayed on every trigger. Nothing in it runs at
  execution time — for a script re-interpreted on each trigger, use
  [`gelato:schedule`](schedule.md).
- Every task executes from your **dedicated msg.sender** (`@gelato:dedicatedMsgSender`),
  a proxy Gelato deploys for your account on first use: Automate no longer accepts
  tasks without it. Inside the block `@sender` **is that proxy** (`@me` stays your
  wallet), so use `@sender` for the address the targets will see. Contracts that
  restrict callers (`onlyKeeper`, allowlists) must allow it, not your wallet, and a
  call carrying `--value` is paid from the proxy's balance — fund it first.
- One call without value is stored as a plain `executeCall`; several calls (or one with
  value) execute atomically through the proxy's `batchExecuteCall`. Either way the
  calls must be contract calls: plain ETH transfers, contract creation and anything
  that is not a transaction (`switch`, `wait`, signatures) are rejected.
- `--every` takes a duration literal (`5m`, `1h`, `2d`); Automate stores intervals in
  milliseconds and the command converts. `--start` is a unix timestamp in seconds.
- `--when <resolver>` needs a single-call block and pins only the selector of that
  call: the resolver's `--check` function returns `(bool canExec, bytes execPayload)`
  and supplies the full calldata at execution time, so the block's arguments are
  ignored for resolver tasks.
- Executions are billed to the Gas Tank of the task creator (`gelato:fund`) unless
  `--pay <token>` makes the target contract pay a sync fee
  (`0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` for the native token).
- Task ids are deterministic; read them back with `@gelato:tasks` / `@gelato:lastTask`,
  rehearse an execution with `gelato:simulate-task` inside `sim:fork`, and cancel with
  `gelato:cancel`.


## See Also

- [gelato:schedule](schedule.md) — re-interpret an EVML script on every trigger
- [gelato:simulate-task](simulate-task.md) — rehearse a task in a fork
