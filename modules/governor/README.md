# governor module

Governance operations: Governor proposals, voting, vote delegation, and TimelockController scheduling.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

```evml
load governor
```

## Commands

| Command | Description |
|---------|-------------|
| [governor:cancel](src/commands/cancel.md) | Cancel a pending Governor proposal (only its proposer, before voting starts). Takes the same description and action block used in governor:propose. |
| [governor:delegate](src/commands/delegate.md) | Delegate the voting power the connected account holds in an ERC20Votes/ERC721Votes token. |
| [governor:execute](src/commands/execute.md) | Execute a succeeded (and queued, if the Governor uses a timelock) proposal. Takes the same description and action block used in governor:propose. |
| [governor:propose](src/commands/propose.md) | Create a Governor proposal from a block of commands: each action in the block becomes one of the proposal calls. Optionally binds the proposal id to a variable. |
| [governor:queue](src/commands/queue.md) | Queue a succeeded Governor proposal into its timelock. Takes the same description and action block used in governor:propose. |
| [governor:timelock-cancel](src/commands/timelock-cancel.md) | Cancel a pending TimelockController operation. The sender needs the CANCELLER_ROLE. |
| [governor:timelock-execute](src/commands/timelock-execute.md) | Execute a ready TimelockController operation. Takes the same action block, predecessor and salt used in governor:timelock-schedule. |
| [governor:timelock-schedule](src/commands/timelock-schedule.md) | Schedule a batch of actions on a TimelockController. Optionally binds the operation id to a variable for later state checks or cancellation. |
| [governor:vote](src/commands/vote.md) | Cast a vote on an active Governor proposal. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@governor:proposalId](src/helpers/proposalId.md) | `number` | Proposal id of a Governor proposal, derived from its targets, values, calldatas and description. Prefer the optional variable of governor:propose when creating the proposal in the same script. As @proposalId! the id is read on-chain at assertion time through orElse(getProposalId, hashProposal) — whichever derivation the governor exposes wins. |
| [@governor:proposalState](src/helpers/proposalState.md) | `string` | Current state of a Governor proposal: Pending, Active, Canceled, Defeated, Succeeded, Queued, Expired or Executed. As @proposalState! the state(id) read happens on-chain at assertion time as the RAW uint8 enum value (0 Pending, 1 Active, 2 Canceled, 3 Defeated, 4 Succeeded, 5 Queued, 6 Expired, 7 Executed) — the string mapping stays off-chain. |
| [@governor:timelockMinDelay](src/helpers/timelockMinDelay.md) | `number` | Minimum delay in seconds a TimelockController enforces on new operations. As @timelockMinDelay! the getMinDelay() read happens on-chain at assertion time. |
| [@governor:timelockOperationState](src/helpers/timelockOperationState.md) | `string` | State of a TimelockController operation: Unset, Waiting, Ready or Done. As @timelockOperationState! a nested core cond over the timelock's isOperationDone/isOperationReady/isOperationPending views producing OZ's NUMERIC OperationState (0 Unset, 1 Waiting, 2 Ready, 3 Done) — the string mapping stays off-chain. |

