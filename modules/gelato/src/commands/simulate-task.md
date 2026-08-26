---
title: "gelato:simulate-task"
---

Execute a Gelato Automate task the way Gelato's executors would — only inside a simulation: impersonates the Gelato executor and calls Automate.exec, so the resolver, the dedicated msg.sender proxy, single-exec cancellation and fee accounting all run for real against the fork. Resolver tasks are executed only when their checker says canExec; Web3 Function tasks cannot be simulated (the function runs off-chain).

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
  gelato:automate 0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83 approve(address,uint256) 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 0 --once true
  gelato:simulate-task @gelato:lastTask()
  sim:expect @bool(@lang:len(@gelato:tasks()) == 0)
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
- Web3 Function tasks cannot be simulated: the function decides the calls off-chain.


## See Also
