# Routed smart batches: integration design

Status: smart-batch routing is proposed. Safe address prediction with a custom salt
nonce is implemented as described below. Source inspection completed on
2026-09-23.

## Scope

Support execution-time reads, typed return captures, conditions and loops in
Governor proposals, TimelockController operations, Aragon OS forwarding,
Aragon OSx proposals/direct execution, and EEZ remote execution. Use a Safe
treasury controlled by the account that delivers the routed call. The Safe holds
the tokens and external protocol permissions, and is the caller seen by targets.
Governance authorizes the call; EEZ transports it; the Safe executes the plan.

The existing runtime-capable governance commands (such as voting from a Safe)
are a different capability: they do not make the eventual proposal action block
a smart batch.

## Deterministic Safe addresses (implemented)

Reuse `safe:new owner --salt salt` to deploy a single-owner Safe with threshold
1. `@safe:address(owner salt)` predicts the same address without RPC; the salt
defaults to 0, matching `safe:new`. Use the actual executing controller as owner:
the Governor's timelock, Aragon's final forwarder, the OSx DAO, or the EEZ
source caller's destination proxy. Inside a routed block, pass `@sender`.

```evml
load safe
set $owner 0x1111111111111111111111111111111111111111
set $salt 42
set $treasurySafe @safe:address($owner $salt)
safe:new $owner --salt $salt
```

Both entry points use the chain-specific Safe 1.4.1 L2 factory, singleton and
compatibility fallback handler, with the same proxy creation code. The caller
chooses the salt; there is no reserved treasury namespace or custom wallet.
Prediction does not discover an existing DAO's official treasury or check
whether the Safe is deployed. Owners and threshold can change without changing
the address. A repeated deployment of the same configuration and salt reverts.

## Current implementation

- `packages/sdk/src/onchain/smart.ts` compiles the common plan and lowers it to
  composability-executor calls plus any ordinary transaction steps.
- `SmartBatchPlan.route` currently supports `delegatecall` and `executor`.
  The latter requires the account's installed ERC-7579 executor callback; it is
  not a generic route for any contract able to make a CALL.
- `modules/safe/src/utils/index.ts` provides the existing wrapper pattern:
  select the execution account, compile, verify deployed dependencies, lower,
  then put the actions into the authenticated Safe transaction.
- `modules/governor/src/utils.ts` collects fixed target/value/calldata arrays.
- `modules/aragonos/src/utils/forwarders.ts` builds ordinary CallsScripts.
- `modules/aragonosx/src/utils/osxActions.ts` builds fixed DAO Action structs
  and explicitly rejects delegatecalls.
- `modules/eez/src/utils/eez.ts` resolves the destination chain and the source
  sender's destination proxy before interpreting remote commands.

Adding `createsSmartBatchContext: true` to the governance commands is therefore
insufficient. Removing `operation: 1` from a lowered action would change its
meaning, not adapt it.

## Required execution support

| System | Proposed route | Sole Safe owner, threshold 1 |
| --- | --- | --- |
| Governor with timelock | Governor -> timelock -> Safe | Timelock |
| Governor without timelock | Governor -> Safe | Governor |
| Aragon OS | Forwarder chain -> Safe | Final forwarder, such as Agent or Voting |
| Aragon OSx | Governance plugin -> DAO.execute -> Safe | DAO |
| OSx direct execution | Authorized caller -> DAO.execute -> Safe | DAO |
| EEZ | Source caller -> EEZ -> destination Safe | Destination proxy representing the actual source caller |

These are proposed integration routes, not claims of deployed compatibility.
They use existing account contracts; each deployment must configure its Safe
and transfer the required assets and permissions explicitly. An additional Safe
owner or enabled module would introduce another execution authority.

### Governor and timelock

Preferred architecture:

```text
Governor -> TimelockController -> Safe treasury -> protocol contracts
                                   |
                                   +-- delegatecall composability executor
```

Use the Safe deployment/version supported by EVMcrispr (currently v1.4.1).
Configure the timelock as sole owner with threshold 1, with no independent
execution modules. Call `execTransaction` using the timelock's prevalidated
signature: the contract authenticates the immediate caller without requiring
an ECDSA signature or ERC-1271 implementation on the timelock. Set `safeTxGas`
and `gasPrice` to zero so an inner failure reverts. These behaviors are present
in [Safe v1.4.1](https://github.com/safe-global/safe-smart-account/blob/v1.4.1/contracts/Safe.sol).

This reuses `compileSmartBatch` with the Safe account and delegatecall route,
`buildSafeTxContent`, `preValidatedSignature`, and `encodeExecTransaction`.
The result is an ordinary CALL action embedded in a standard governance
proposal. A new pure encoding wrapper is needed: today's `safe:execute <safe>
!(...)` is not batchable and uses the connected wallet's execution flow.

The prevalidated signature authorizes the timelock's call rather than binding
a future Safe nonce. Consequently the encoded call need not lock proposal
execution to a predicted nonce; execution-time transaction hashes must not be
precomputed as fixed receipt expectations. Proposal payloads must still be
persisted unchanged across the governance lifecycle.

The Safe holds tokens and relevant external protocol permissions; `@sender`
inside its smart block is the Safe. Governor administration and timelock-only
operations remain ordinary proposal actions from the timelock. This also keeps
Governor's `onlyGovernance` call tracking intact. Migrating assets does not
automatically migrate external ownership/roles.

Alternatively, a timelock can be enabled as a Safe module, but the module API
returns false on an inner execution failure rather than necessarily reverting.
A direct TimelockController call does not interpret that boolean. That route
needs explicit on-chain failure propagation; receipt checks alone cannot undo
an operation already marked complete. Prefer the owner route above for this
integration. See [ModuleManager](https://github.com/safe-global/safe-smart-account/blob/v1.4.1/contracts/base/ModuleManager.sol).

Only deployments that require targets to continue seeing the original
Governor/timelock as caller need the previously considered account execution
extension. A separate wallet deliberately changes the treasury identity.

### Aragon OS

Keep the existing CallsScript format. Its final action calls Safe.execTransaction
with a prevalidated signature for the final forwarder. For Voting -> Agent ->
Safe, the owner is Agent; for Voting -> Safe, it is Voting. The token-holding
Safe runs the smart plan. No custom EVMScript executor is required for this route.
CallsScript carries a zero-value Safe call; native spending inside the smart
batch is funded from the Safe's own balance.

Running smart calls from an existing Agent address remains a separate optional
feature requiring a registered smart EVMScript executor. It is not required
for the common Safe treasury architecture.

### Aragon OSx

`propose` embeds the Safe call in the plugin's ordinary proposal action array;
`act` embeds it in a direct DAO execution. In both cases the Safe owner is the
DAO, because DAO.execute is the immediate caller of the Safe. Existing voting
and execution permissions remain on the DAO/plugin.

The Safe makes treasury calls directly, so this path does not reenter
DAO.execute and needs no DAO upgrade or custom governance plugin. Calling back
into DAO.execute from that smart batch can still hit the reentrancy guard;
administrative operations that must run as the DAO remain ordinary DAO actions.

### EEZ

On destination chain B, configure Safe B's owner as the authenticated EEZ proxy
representing the actual caller on source chain A. If Safe A sends the message,
the owner is proxy_B(Safe A), not the user's EOA proxy or the same numeric address
as Safe A. Resolve this using both the source identity and its rollup ID.

Compile the smart plan against B's RPC, Safe B, and verified dependencies on B.
Wrap it in one ordinary Safe.execTransaction call authorized for that destination
proxy, then let the existing eez:on routing deliver it. The chain's proxy of
Safe B is the outbound target; the source caller's proxy on B is its inbound
identity. Those are different proxies and must not be confused.

One remote Safe call already executes all its inner steps atomically, so this
route does not require the EEZ proxy's executeBatch capability. It can also be
carried inside eez:batch when grouping additional destination calls and when
that capability is available. Proxies and dependencies must be available and
verified on the correct chains.

EEZ's current integration is synchronous: cross-chain return/revert behavior
belongs to that transport. This is not a generic asynchronous bridge design.
The smart plan remains a destination-local plan; its captures and storage
namespace do not automatically become source-chain runtime values. Cross-chain
runtime dataflow is separate compiler work, even though EEZ transports returns.

Do not remove the current prohibition on eez:on/eez:batch inside an active
single-chain smart plan merely to enable this. Place the destination smart
wrapper inside an ordinary EEZ routing context and compile it after switching
the compilation chain. Cross-chain gas estimation and execution need the EEZ
ingress/composer; an ordinary local simulation cannot validate the entire route.

## Proposed DSL and compiler work

Prefer one embeddable command, provisionally `safe:batch <safe> !(...)`, that
compiles a smart block into an ordinary transaction action without submitting
it or asking for owner signatures. This name is proposed, not implemented.
Existing governor:propose/queue/execute, timelock-schedule/execute,
aragonos:forward, aragonosx:propose/act and eez:on/batch carry that action.
Separate smart variants for every routing command are unnecessary.

Example structure (pseudocode; safe:batch is not available yet):

```text
governor:propose $governor "Migrate treasury" (
  safe:batch $treasurySafe !(
    vault:redeem max of $oldVault -> [$assets]
    vault:deposit $assets into $newVault
  )
)

eez:on eezL2 (
  safe:batch $destinationSafe !(
    token:transfer @balance!($token @sender) $token to $recipient
  )
)
```

Before entering the smart block, read the enclosing context's sender as the
controller expected to call the Safe. Validate sole ownership and threshold on
the Safe's chain. Inside the block, @sender becomes the Safe; @me remains the
connected wallet. Runtime values resolve at execution, not proposal creation.

Share the existing Safe compilation/encoding implementation. Preserve ordinary
and composable steps in order, including native transfers. Allow a smart block
inside ordinary routing contexts; continue to reject unsupported nesting inside
another active smart plan. This applies to commands that carry transaction
actions, not wallet prompts, off-chain side effects or every command indiscriminately.

Retain executionPlan metadata through outer wrappers for review. Since one
proposal can contain several Safe calls, review metadata may need to represent
multiple plans. Preserve sender/chain validation, failure requirements and
cross-chain gas requirements instead of silently dropping action annotations.

Governor/timelock lifecycle commands must reuse identical encoded payloads.
The compiler currently generates a random salt by default, and ordinary helper
reads may also change the compiled bytes. Persist the compiled actions as a
proposal artifact and reuse those bytes for queue/execute/cancel. An explicit
`--batch-salt` can support deterministic reconstruction only when all build-time
inputs are also identical. Keep it distinct from TimelockController's existing
`--salt`, and do not derive it from the lifecycle command name.

Smart execution must propagate failures and revert all its own steps. OSx's
`allowFailureMap` must not allow a failed smart plan to be silently recorded as
successful execution; reject incompatible failure-map settings in smart
wrappers. Receipt-level verification must also reflect any enclosing protocol
that records execution failure without reverting the submitted transaction.

Before encoding a smart governance action, verify the account's supported
route, executor identity/enabled registration, deployed dependency bytecode,
and chain. Unknown deployments get an actionable unsupported-route error.

## Validation required before release

Use authenticated local EVM fixtures for each supported protocol version,
including the real governance lifecycle rather than impersonating the treasury:

- Execute a return-producing call and consume its captured result after an
  intervening state change; assert the actual target caller and treasury funds.
- Exercise a Safe owned by a real TimelockController using the caller-authorized
  owner route. Prove that an inner failure rolls back timelock completion and
  Safe nonce, and that another caller cannot reuse the prevalidated signature.
- Execute independent proposals in different orders without a predicted Safe
  nonce dependency, while checking each operation's own replay protection.
- Propose, queue and execute exactly the same stored payload; verify IDs remain
  stable and changed calldata cannot execute the approved operation.
- Reject unauthorized direct entry, premature execution, wrong predecessors,
  cancelled operations, replay and mismatched executor deployments.
- Exercise nested runtime branches, output-storage isolation, ordinary native
  transfers between composable steps, and rollback after a final assertion.
- Exercise Aragon forwarding chains; prove only the correct final forwarder
  can authorize the Safe and native spending uses the Safe balance.
- Exercise OSx reentrancy behavior and failure maps with actual DAO bytecode.
- Exercise eez:on -> destination Safe through the EEZ composer; check both
  proxy identities, wrong-source rejection, destination dependency validation,
  runtime reads after writes, and rollback on both chains. Test a single Safe
  call without relying on the proxy's optional executeBatch support.
- Check sender and chain restoration after nested routing succeeds or fails;
  verify that captured runtime values do not escape their Safe smart block.
- Exercise Governor `onlyGovernance` calls explicitly; preserve or reject them
  according to the supported integration instead of silently wrapping them.
- Keep current Safe/ERC-7579 execution and ordinary governance tests passing.

Then regenerate module metadata/docs and smart-command inventory, and run the
SDK/compiler/module tests and type checks. Deployment fixtures and DSL wrappers
should land together for each supported route. These tests have not been run
for the proposed integration; no new runtime command has been implemented.

## Suggested delivery order

1. Shared Safe encoding command with authenticated caller, ownership and
   rollback tests.
2. Governor/timelock and Aragon OS/OSx integration, including unchanged proposal
   artifacts and execution-plan review metadata.
3. EEZ destination Safe integration with real cross-chain tests.

## Primary sources inspected

- [Biconomy ComposableExecutionModule](https://github.com/bcnmy/composability/blob/main/contracts/ComposableExecutionModule.sol): distinct callback and delegatecall routes.
- [OpenZeppelin Governor](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/governance/Governor.sol): ordinary action execution and `onlyGovernance` call tracking.
- [OpenZeppelin TimelockController](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/governance/TimelockController.sol): operation hashing, scheduling and CALL execution.
- [Aragon OS EVMScriptRunner](https://github.com/aragon/aragonOS/blob/master/contracts/evmscript/EVMScriptRunner.sol): registered-executor delegatecall, return format and protected state.
- [Aragon Agent](https://github.com/aragon/aragon-apps/blob/master/apps/agent/contracts/Agent.sol): forwarding permission and EVMScript execution.
- [Aragon OSx DAO](https://github.com/aragon/osx/blob/main/src/core/dao/DAO.sol): execution permission, CALL actions, failure map and reentrancy guard.

These links follow upstream branches. Implementation fixtures must pin exact
commits and deployment profiles before treating them as compatibility evidence.
