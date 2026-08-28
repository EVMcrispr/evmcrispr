---
title: "gelato:schedule"
---

Create a Gelato Automate task that interprets an EVML script (a <<<EVML heredoc) off-chain on every trigger and executes the calls it produces: --every <duration>, --cron <expression>, --on <address> --event <signature>, --once, or every block when no trigger is given. The script runs in Gelato's sandbox through the EVML runner: @me is your wallet, @sender the dedicated msg.sender (@gelato:dedicatedMsgSender) every execution comes from; a script that produces no calls (or exits) skips that execution. With --function <cid> the task runs your own Web3 Function (deployed with npx w3f deploy) instead, with --args as its user args. Executions are billed to your Gas Tank unless --pay names a fee token the target pays with.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
gelato:schedule [source]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[source]` | `string` | EVML script to run on every trigger (use a <<<EVML heredoc); omit with --function |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--every` | `number` | Run on an interval, e.g. 5m, 1h, 1d |
| `--start` | `number` | Unix timestamp (seconds) of the first --every execution |
| `--cron` | `string` | Run on a cron schedule, e.g. "0 0 * * *" |
| `--on` | `address` | Contract whose --event triggers the task |
| `--event` | `string` | Event signature, e.g. "Deposit(address,uint256)", or a topic hash |
| `--once` | `bool` | Execute a single time, then the task cancels itself |
| `--rpc` | `string` | JSON-RPC URL the script reads the chain through, outside the quota of Gelato's provider (stored on-chain with the task, so never a secret one) |
| `--function` | `string` | CID of a Web3 Function deployed with npx w3f deploy, to run instead of an EVML script |
| `--args` | `any` | Web3 Function user args as an entries array, e.g. [[vault 0x…] [threshold 100]] |
| `--pay` | `address` | Fee token the target contract pays executions with (sync fee) instead of your Gas Tank |

## Examples

```evml
# Every midnight, re-approve the vault for the whole USDC balance the dedicated msg.sender holds by then
gelato:schedule --cron "0 0 * * *" <<<EVML
load token
token:approve @token:balance(0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83 @me) 0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83 for 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
EVML

# Run a Web3 Function of your own (deployed with npx w3f deploy) every five minutes
gelato:schedule --function QmTestWeb3FunctionCidEvmcrisprGelatoModule0000000 --args [[vault 0x4F2083f5fBede34C2714aFfb3105539775f7FE64] [threshold 5]] --every 5m
```

<!-- HAND-WRITTEN -->

## Notes

- The script is interpreted **on every trigger**, off-chain, by the EVML runner: a
  generic Web3 Function EVMcrispr publishes to Gelato's function store once per
  release and pins by CID. What it produces on each run is what executes, so
  conditions, balances and helpers are evaluated live. To freeze a batch of calls at
  creation time instead, use [`gelato:automate`](automate.md).
- Inside the script `@me` is your wallet, as when you wrote it, and `@sender` is your
  **dedicated msg.sender** (`@gelato:dedicatedMsgSender`), the proxy every execution
  comes from. Targets that restrict callers must allow it,
  and calls carrying value are paid from its balance — fund it first. The calls must
  be contract calls: plain ETH transfers, contract creation, `switch`, `wait` and
  signatures have no place in a task.
- A run that produces no calls, or `exit`s before any, skips that execution
  (`canExec: false`); an error in the script does too, with its message in Gelato's
  logs. That is how a script guards itself: `if … ( exit )`.
- The runner ships every module except `sim`, `circom`, `noir`, `semaphore` and
  `gelato` — a fork, WASM toolchains and the terminal do not exist in Gelato's sandbox.
  `load` lines naming them are refused before the task is created; the rest of the
  script is only parsed here, so validate it in the editor and rehearse it with
  `gelato:simulate-task` inside `sim:fork` before scheduling.
- The script (and `--rpc`) travel in the task's user args, **on-chain and in the
  clear**. Never put a secret in them.
- Gelato's standard plan allows about 10 seconds and 10 RPC calls per run through its
  own provider; each `exec` with a fetched ABI, each `::` read and each helper that
  reads the chain costs calls. `--rpc <url>` reads through your endpoint instead,
  outside that quota.
- Without a trigger the task runs every block, Gelato's default for Web3 Functions.
  `--every` takes a duration literal (`5m`, `1h`, `2d`); `--start` is a unix
  timestamp in seconds.
- `--function <cid>` runs a Web3 Function of your own, deployed with
  `npx w3f deploy`; `--args` values are ABI-encoded against the `userArgs` of its
  `schema.json`, read from the function store.
- Executions are billed to the Gas Tank of the task creator (`gelato:fund`) unless
  `--pay <token>` makes the target contract pay a sync fee. Task ids are
  deterministic; read them back with `@gelato:tasks` / `@gelato:lastTask` and cancel
  with `gelato:cancel`.

## See Also

- [gelato:automate](automate.md) — freeze a block of calls into a task
- [gelato:simulate-task](simulate-task.md) — rehearse a scheduled script in a fork
- [@gelato:dedicatedMsgSender](../helpers/dedicatedMsgSender.md) — the address the script runs as
