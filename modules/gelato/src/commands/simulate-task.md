---
title: "gelato:simulate-task"
---

Execute a Gelato Automate task the way Gelato's executors would — only inside a simulation: impersonates the Gelato executor and calls Automate.exec, so the resolver, the dedicated msg.sender proxy, single-exec cancellation and fee accounting all run for real against the fork. Resolver tasks are executed only when their checker says canExec; EVML tasks (gelato:schedule) have their script interpreted here, as the runner would, and execute what it produces; other Web3 Function tasks cannot be simulated (the function runs off-chain).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
gelato:simulate-task <taskId>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `taskId` | `bytes32` | Task id to execute |

## Examples

```evml
# Create a one-shot task, run it as Gelato would, and see it cancel itself
load sim
load lang

sim:fork --using anvil (
  sim:set-balance @me 100e18
  gelato:automate --once true (
    exec 0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83 approve(address,uint256) 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 0
  )
  gelato:simulate-task @gelato:lastTask()
  sim:expect @bool(@lang:len(@gelato:tasks()) == 0)
)

# Schedule an EVML script and run it as the runner would: the calls it produces execute from the dedicated msg.sender
load sim
load token

sim:fork --using anvil (
  sim:set-balance @me 100e18
  gelato:schedule --once true <<<EVML
load token
token:approve 1e6 0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83 for 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71
EVML
  gelato:simulate-task @gelato:lastTask()
  sim:expect @bool(@token:allowance(0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83 @gelato:dedicatedMsgSender() 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71) == 1e6)
)
```

<!-- HAND-WRITTEN -->

## Notes

- Refused outside `sim:fork`: on a live chain only Gelato's executors may call
  `Automate.exec`. In the fork the executor address (`Automate.gelato()`) is funded
  and impersonated, so the same code path runs — resolver check, dedicated
  msg.sender proxy, `--once` self-cancellation, 1Balance/sync-fee accounting.
- The task payload is read from its `TaskCreated` log (Automate stores only the id
  hash), searching back up to 2M blocks.
- The dedicated msg.sender proxy rejects targets without code
  (`OpsProxy.executeCall: UnexpectedReturndata`), so point tasks at real contracts.
- Tasks created by `gelato:schedule` with an EVML script are interpreted here, the way
  the runner would: as the dedicated msg.sender, collecting the calls the script
  produces and executing them through `batchExecuteCall`. A script that produces no
  calls fails the simulation (Gelato would skip that execution). Modules the
  enclosing script already loaded are shared with it, so a bare `load` of one is
  skipped rather than refused as a duplicate.
- Other Web3 Function tasks (`--function <cid>`) cannot be simulated: the function
  decides the calls off-chain.


## See Also

- [gelato:schedule](schedule.md) — the EVML tasks this command can rehearse
