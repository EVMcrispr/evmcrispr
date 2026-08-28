# gelato module

Gelato automation: run EVML scripts off-chain on a trigger through the EVML runner Web3 Function (gelato:schedule, interval, cron, event or one-shot), freeze the calls of an EVML block into an Automate task (gelato:automate, optionally gated by an on-chain checker), fund and withdraw the Gas Tank (1Balance) that pays for executions, run tasks inside a simulation, and read tasks, balances and dedicated msg.senders back.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

```evml
load gelato
```

## Commands

| Command | Description |
|---------|-------------|
| [gelato:automate](src/commands/automate.md) | Create a Gelato Automate task that executes the calls of a block on a trigger: --every <duration> (interval), --cron <expression>, --when <resolver> (an on-chain checker whose --check function returns whether and with what calldata to execute), --on <address> --event <signature> (event trigger), or --once (execute as soon as possible, a single time). The block is interpreted now and its calls are frozen into the task; several calls execute atomically through the dedicated msg.sender's batchExecuteCall. Inside the block @sender is your dedicated msg.sender (@gelato:dedicatedMsgSender), the address every execution comes from, so targets that restrict callers must allow it; @me stays your wallet. Executions are billed to your Gas Tank unless --pay names a fee token the target pays with. |
| [gelato:cancel](src/commands/cancel.md) | Cancel a Gelato Automate task you created. Find task ids with @gelato:tasks or @gelato:lastTask. |
| [gelato:cancel-withdrawal](src/commands/cancel-withdrawal.md) | Put a settled withdrawal request back into the Gelato Gas Tank instead of withdrawing it (on Polygon). Needs the same merkle proof as gelato:withdraw — fetched from the 1Balance API, or given with --proof and --total. |
| [gelato:fund](src/commands/fund.md) | Deposit USDC into the Gelato Gas Tank (1Balance) that pays for Automate, Web3 Function and VRF executions on every chain. Deposits happen on Polygon only; `for <sponsor>` credits another account (a DAO, a Safe) instead of yours. Approves the exact amount first when the allowance falls short. |
| [gelato:request-withdrawal](src/commands/request-withdrawal.md) | Ask the Gelato Gas Tank to release USDC back to you (step 1 of 2, on Polygon). Gelato settles requests off-chain; once settled, gelato:withdraw moves the funds and gelato:cancel-withdrawal puts them back into the tank. |
| [gelato:schedule](src/commands/schedule.md) | Create a Gelato Automate task that interprets an EVML script (a <<<EVML heredoc) off-chain on every trigger and executes the calls it produces: --every <duration>, --cron <expression>, --on <address> --event <signature>, --once, or every block when no trigger is given. The script runs in Gelato's sandbox through the EVML runner: @me is your wallet, @sender the dedicated msg.sender (@gelato:dedicatedMsgSender) every execution comes from; a script that produces no calls (or exits) skips that execution. With --function <cid> the task runs your own Web3 Function (deployed with npx w3f deploy) instead, with --args as its user args. Executions are billed to your Gas Tank unless --pay names a fee token the target pays with. |
| [gelato:simulate-task](src/commands/simulate-task.md) | Execute a Gelato Automate task the way Gelato's executors would — only inside a simulation: impersonates the Gelato executor and calls Automate.exec, so the resolver, the dedicated msg.sender proxy, single-exec cancellation and fee accounting all run for real against the fork. Resolver tasks are executed only when their checker says canExec; EVML tasks (gelato:schedule) have their script interpreted here, as the runner would, and execute what it produces; other Web3 Function tasks cannot be simulated (the function runs off-chain). |
| [gelato:withdraw](src/commands/withdraw.md) | Withdraw settled USDC from the Gelato Gas Tank (step 2 of 2, on Polygon). Presents the merkle proof Gelato published after settling your gelato:request-withdrawal; fetched from the 1Balance API, or given with --proof and --total. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@gelato:automate](src/helpers/automate.md) | `address` | Address of the Gelato Automate task registry on the current chain, for direct calls. |
| [@gelato:balance](src/helpers/balance.md) | `number` | USDC a sponsor has put into the Gelato Gas Tank and not withdrawn (deposits minus withdrawals, 6 decimals), read from Polygon whatever chain the script is on. Fees Gelato has already charged are not deducted — the live balance is on app.gelato.cloud. |
| [@gelato:dedicatedMsgSender](src/helpers/dedicatedMsgSender.md) | `address` | The dedicated msg.sender Gelato assigns an account on this chain: the proxy every task of that account executes from (what @sender resolves to inside gelato:automate blocks and gelato:schedule scripts), and the operator a VRF consumer is deployed with. Deterministic, so it resolves before the proxy is deployed. |
| [@gelato:lastTask](src/helpers/lastTask.md) | `bytes32` | Id of the most recently created active Gelato Automate task of an account — handy right after gelato:automate. |
| [@gelato:tasks](src/helpers/tasks.md) | `array` | Ids of the active Gelato Automate tasks an account created, oldest first. |
| [@gelato:withdrawn](src/helpers/withdrawn.md) | `number` | USDC a sponsor has withdrawn from the Gelato Gas Tank in total (6 decimals), read from Polygon. |

