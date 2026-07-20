# superfluid module

Superfluid streaming payments: open, update and stop money streams (CFA) with native rate literals like 1000e18/mo, distribute to many receivers at once through GDA pools, wrap and unwrap SuperTokens, and automate with scheduled flows, vesting schedules and auto-wrap — approvals and flow-operator permissions handled automatically.

```evml
load superfluid
```

## Configuration variables

Config variables are set with `set` (fully qualified, including the module prefix) and are only readable by their own module and the user script.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `$superfluid:tokenlist` | `string` | `https://tokenlist.superfluid.org/superfluid.extended.tokenlist.json` | Superfluid extended tokenlist URL used to resolve SuperToken symbols (must be HTTPS). |

## Commands

| Command | Description |
|---------|-------------|
| [superfluid:auto-wrap](src/commands/auto-wrap.md) | Keep a SuperToken balance topped up automatically: when the balance falls below --lower of outflow runway, Superfluid's keepers wrap enough underlying to reach --upper. WARNING: by default this grants the wrap strategy an unlimited allowance on the underlying token (matching Superfluid's own UI, since the schedule is open-ended) — cap it with --allowance. |
| [superfluid:claim](src/commands/claim.md) | Claim all accrued earnings from a GDA pool without connecting to it. Anyone can trigger the claim; the tokens always go to the member. |
| [superfluid:connect-pool](src/commands/connect-pool.md) | Connect the sender to a GDA pool so pool earnings count toward the real-time balance automatically. Disconnected members still accrue but must claim explicitly. |
| [superfluid:create-pool](src/commands/create-pool.md) | Create a GDA distribution pool for a SuperToken and bind the predicted pool address to <variable>. Members hold units and every distribution splits pro-rata to units. The prediction reads the pool factory's account nonce, so it assumes no other pool is created on the chain between planning and execution. |
| [superfluid:disconnect-pool](src/commands/disconnect-pool.md) | Disconnect the sender from a GDA pool. Earnings keep accruing but no longer count toward the real-time balance until claimed or reconnected. |
| [superfluid:distribute](src/commands/distribute.md) | Distribute a SuperToken amount instantly to all members of a GDA pool, pro-rata to their units. The actual amount may round down slightly so every unit receives the same integer share. |
| [superfluid:distribute-flow](src/commands/distribute-flow.md) | Stream a SuperToken to all members of a GDA pool, split pro-rata to their units as they change over time. Rates are wei per second — use a rate literal like 1000e18/mo; a rate of 0 stops the distribution flow. Like any stream, it locks a buffer deposit from the distributor. |
| [superfluid:grant-flow-operator](src/commands/grant-flow-operator.md) | Let an operator manage your streams of a SuperToken. Defaults to full control (create, update, delete) with unlimited flow-rate allowance; restrict with --permissions and --allowance. The allowance is a decrementing budget consumed by creates and rate increases. |
| [superfluid:revoke-flow-operator](src/commands/revoke-flow-operator.md) | Revoke an operator's permissions over your streams of a SuperToken. |
| [superfluid:schedule-flow](src/commands/schedule-flow.md) | Schedule a stream to start and/or end at future timestamps, executed by Superfluid's keeper network. Automatically grants the FlowScheduler the flow-operator permissions it needs (create for --start, delete for --end) plus a SuperToken allowance when --start-amount is set. At least one of --start / --end is required; execution is permissionless but not guaranteed if the grants are revoked. |
| [superfluid:set-units](src/commands/set-units.md) | Set a member's share units in a GDA pool (admin only). Units are plain unitless weights: a member with 3 units earns 3x what a member with 1 unit earns. Setting 0 removes the member from future distributions. |
| [superfluid:stop-auto-wrap](src/commands/stop-auto-wrap.md) | Cancel an auto-wrap schedule. The strategy's token allowance is not touched — revoke it with token:approve 0 if you want it gone. |
| [superfluid:stop-stream](src/commands/stop-stream.md) | Stop a money stream to a receiver, refunding the sender's buffer deposit. With --from, deletes another sender's stream — allowed for the stream's receiver, a granted flow operator, or anyone once the sender is insolvent. |
| [superfluid:stop-vesting](src/commands/stop-vesting.md) | Delete a pending vesting schedule, or end a running one immediately with --now true (the receiver keeps what has vested so far). |
| [superfluid:stream](src/commands/stream.md) | Open a money stream of a SuperToken to a receiver, or retarget an existing one to the new rate (idempotent). Rates are wei per second — use a rate literal like 1000e18/mo. Opening a stream locks a buffer deposit (hours of streaming) that is refunded when the stream stops. |
| [superfluid:unschedule-flow](src/commands/unschedule-flow.md) | Cancel a pending flow schedule (both its start and end legs). Streams already opened keep running — use stop-stream for those. |
| [superfluid:unwrap](src/commands/unwrap.md) | Unwrap a SuperToken back to its underlying token (DAIx to DAI, xDAIx to native xDAI...). The amount is in the SuperToken's 18-decimal base units; pass `max` to unwrap the full balance. Keep some balance if streams are still running — unwrapping below the buffer makes them liquidatable. |
| [superfluid:vest](src/commands/vest.md) | Vest a total SuperToken amount to a receiver over a duration through the VestingScheduler (V3), executed by Superfluid's keeper network. With --cliff, everything accrued up to the cliff is transferred at once when it passes, then the rest streams. Automatically grants the scheduler flow-operator rights and the SuperToken allowance it needs; execution is permissionless but not guaranteed if the grants are revoked. |
| [superfluid:wrap](src/commands/wrap.md) | Wrap an underlying token into its SuperToken (DAI to DAIx, native xDAI to xDAIx...), approving the SuperToken automatically when needed. The amount is in the underlying token's base units (e.g. 100e6 for 100 USDC); SuperTokens themselves are always 18 decimals. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@superfluid:balance](src/helpers/balance.md) | `number` | Real-time available SuperToken balance of an account: the streaming balance at this instant, minus buffer deposits. Negative when the account is critical. |
| [@superfluid:buffer](src/helpers/buffer.md) | `number` | Buffer deposit locked when opening a stream at the given flow rate (typically a few hours of streaming; Ethereum mainnet enforces per-token minimums). |
| [@superfluid:claimable](src/helpers/claimable.md) | `number` | Amount a member can claim from a GDA pool right now (accrued earnings not yet reflected in their balance). |
| [@superfluid:connected](src/helpers/connected.md) | `bool` | Whether a member is connected to a GDA pool (connected members see pool earnings in their balance automatically). |
| [@superfluid:distributionFlowrate](src/helpers/distributionFlowrate.md) | `number` | Flow rate a distributor is currently streaming into a GDA pool, in wei per second. |
| [@superfluid:flow](src/helpers/flow.md) | `number` | Current flow rate between a sender and a receiver, in wei per second (0 when no stream exists). |
| [@superfluid:memberFlowrate](src/helpers/memberFlowrate.md) | `number` | The slice of a GDA pool's distribution flow currently streaming to a member, in wei per second. |
| [@superfluid:netflow](src/helpers/netflow.md) | `number` | Net flow rate of an account (all incoming minus all outgoing streams, CFA plus GDA), in wei per second. Negative means the balance is draining. |
| [@superfluid:token](src/helpers/token.md) | `address` | Resolve a SuperToken from the Superfluid token list: by SuperToken symbol (USDCx), or by underlying token address (the USDC address returns USDCx). |
| [@superfluid:totalUnits](src/helpers/totalUnits.md) | `number` | Total units across all members of a GDA pool. |
| [@superfluid:underlying](src/helpers/underlying.md) | `address` | Underlying ERC-20 of a SuperToken (the zero address for native-asset SuperTokens like ETHx or xDAIx). |
| [@superfluid:units](src/helpers/units.md) | `number` | A member's share units in a GDA pool. |

