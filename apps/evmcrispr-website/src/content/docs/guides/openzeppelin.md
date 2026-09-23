---
title: Managing OpenZeppelin Contracts
description: Manage AccessControl roles and proxy upgrades through a Safe multisig or OpenZeppelin Governor.
experimental: true
---

Use the `acl` module to manage permissions and `proxies` to prepare upgrades,
then put those commands inside a `safe` or `governor` block to execute through
your multisig or governance process. This guide assumes the contracts, Safe,
and Governor are already deployed.

These modules are experimental. Use [next.evmcrispr.com](https://next.evmcrispr.com)
or enable experimental modules in your host; the CLI accepts `--experimental`.
All addresses, transaction hashes, and proposal ids below are placeholders.
Replace them with your deployment's values and select its chain before running
a script. Each code block is a separate script, unless stated otherwise.

## Choose the account that holds the permissions

`AccessControl` distinguishes a role from its **admin role**. A minter can mint;
the holder of the minter role's admin role can grant or revoke minting permission.
`DEFAULT_ADMIN_ROLE` is the default admin, but a contract can assign a different
admin to each role. Holding the admin role does not itself grant permission to
call `mint`. See OpenZeppelin's [access-control guide](https://docs.openzeppelin.com/contracts/5.x/access-control).

Give permissions to the account that calls the managed contract:

| Execution path | Account that needs the role or ownership |
| --- | --- |
| A direct wallet transaction | The connected wallet |
| A Safe transaction | The Safe address |
| A Governor without a timelock | The Governor address |
| A Governor using `GovernorTimelockControl` | The `TimelockController` address |

For a timelocked Governor, the timelock executes the approved calls and must
hold the target's permissions. The Governor needs the timelock's proposer and
canceller roles, and execution must be allowed for the Governor (or everyone,
through the timelock's open executor role). The remaining examples assume this
configuration. See OpenZeppelin's [Governor setup](https://docs.openzeppelin.com/contracts/5.x/governance#timelock).

For upgradeable contracts, read and manage application roles at the **proxy
address**, where their state lives. The implementation address is the code
used by the proxy, not the contract instance whose permissions you administer.

## Inspect AccessControl roles

Find the admin role before preparing a grant or revocation:

```evml
load acl

set $token 0x1111111111111111111111111111111111111111
set $safe 0x2222222222222222222222222222222222222222
set $minter 0x3333333333333333333333333333333333333333

set $adminRole @acl:roleAdmin($token MINTER_ROLE)
print "Minter admin role:" $adminRole
print "Safe can manage minters:" @acl:hasRole($token $adminRole $safe)
print "Current minter is authorized:" @acl:hasRole($token MINTER_ROLE $minter)
```

The [`acl:grant`](../reference/acl/commands/grant.md) and
[`acl:revoke`](../reference/acl/commands/revoke.md) commands accept an
AccessControl role name or its exact `bytes32` identifier. Names such as
`MINTER_ROLE` are hashed with keccak256; `DEFAULT_ADMIN_ROLE` maps to zero.
If your contract uses a different identifier, pass its actual `bytes32` value,
which you can read with `@get($token "MINTER_ROLE()(bytes32)")` when that
getter exists. Numeric role ids select AccessManager's interface instead.

These helpers read current chain state while the script is prepared. Read the
roles again after the transaction executes to confirm the result.

## Manage roles through a Safe

Assume the Safe already holds the admin role for `MINTER_ROLE`. If it does not,
the current administrator must grant it that role first. A Safe owner's personal
permissions do not carry over to calls made by the Safe.

This proposal replaces an old minter with a new one in a single Safe transaction:

```evml
load safe
load acl

set $token 0x1111111111111111111111111111111111111111
set $safe 0x2222222222222222222222222222222222222222
set $oldMinter 0x3333333333333333333333333333333333333333
set $newMinter 0x4444444444444444444444444444444444444444

safe:propose $safe (
  acl:grant MINTER_ROLE on $token to $newMinter
  acl:revoke MINTER_ROLE on $token from $oldMinter
) --origin "Rotate token minter"
```

[`safe:propose`](../reference/safe/commands/propose.md) signs and submits the
transaction to the Safe Transaction Service. The remaining owners review and
confirm it in the Safe UI. Once it has enough confirmations, execute there or
with [`safe:execute`](../reference/safe/commands/execute.md), using the proposal's
`safeTxHash` (not an Ethereum transaction hash):

```evml
load safe

set $safe 0x2222222222222222222222222222222222222222
set $safeTxHash 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

safe:execute $safe $safeTxHash
```

The calls execute in order as the Safe. Proposing or signing does not change
the token's roles. For a threshold-one Safe whose owner is connected, you can
use `safe:execute $safe (...)` directly with the same block. For signatures
exchanged without the service, follow the [offline Safe guide](offline-safe.md);
for checking hashes before signing, see the [Safe guide](safe.md).

The same wrapper handles application calls. If the Safe holds `PAUSER_ROLE`
and the token's `pause()` function checks it, prepare a pause like this:

```evml
load safe

set $token 0x1111111111111111111111111111111111111111
set $safe 0x2222222222222222222222222222222222222222

safe:propose $safe (
  exec $token "pause()"
)
```

`PAUSER_ROLE` and `pause()` are application choices; use the roles and functions
your deployed contract actually exposes.

## Manage roles through Governor

The following workflow uses a Governor with `GovernorTimelockControl`. Its
timelock must hold the admin role for `MINTER_ROLE` on the token. The account
submitting the proposal needs the Governor's required voting power, but does
not need the token's admin role.

If a Safe currently administers a plain `AccessControl` token, it can authorize
the timelock through its normal approval process:

```evml
load safe
load acl

set $token 0x1111111111111111111111111111111111111111
set $safe 0x2222222222222222222222222222222222222222
set $governor 0x5555555555555555555555555555555555555555
set $timelock @get($governor "timelock()(address)")
set $adminRole @acl:roleAdmin($token MINTER_ROLE)

safe:propose $safe (
  acl:grant $adminRole on $token to $timelock
)
```

The Safe must also be authorized to grant `$adminRole` itself. If it is
`DEFAULT_ADMIN_ROLE`, this authorizes the timelock to manage every role that
still uses that admin. This adds an administrator; it does not remove the Safe.
For a full handover, verify governance execution first, then revoke the old
administrators through the authorized process. Any retained administrator
remains able to manage those roles independently of Governor votes.

For `AccessControlDefaultAdminRules`, transferring the default admin requires
the delayed acceptance flow described [below](#other-access-control-options),
not this grant. A Governor without a timelock instead needs the role on its own
address and skips the queue step below.

### Propose the role change

For ERC20Votes or ERC721Votes governance, delegate voting power before the
relevant snapshots; [`governor:delegate`](../reference/governor/commands/delegate.md)
can delegate to yourself or another voter. Follow the deployed Governor's
proposal threshold, voting delay, and voting period.

```evml
load governor
load acl

set $token 0x1111111111111111111111111111111111111111
set $oldMinter 0x3333333333333333333333333333333333333333
set $newMinter 0x4444444444444444444444444444444444444444
set $governor 0x5555555555555555555555555555555555555555

governor:propose $proposalId $governor "Rotate token minter" (
  acl:grant MINTER_ROLE on $token to $newMinter
  acl:revoke MINTER_ROLE on $token from $oldMinter
)
print "Proposal id:" $proposalId
```

Save the printed id, description, addresses, and ordered action block. Queueing
and execution must reproduce the original targets, values, and calldata, plus
the exact description. Avoid rebuilding with changing helper results such as
balances or the current wallet address.

### Vote while the proposal is active

Run this separately after the voting delay, replacing `42` with the saved id:

```evml
load governor

set $governor 0x5555555555555555555555555555555555555555
set $proposalId 42

print @governor:proposalState($governor $proposalId)
governor:vote $governor $proposalId for --reason "Replace the retired minter"
```

[`@governor:proposalState`](../reference/governor/helpers/proposalState.md)
returns names such as `Pending`, `Active`, `Succeeded`, `Queued`, and `Executed`.
Vote only while `Active`; proceed to queue only after voting ends successfully.

### Queue, wait, and execute

Once the proposal is `Succeeded`, queue its original calls:

```evml
load governor
load acl

set $token 0x1111111111111111111111111111111111111111
set $oldMinter 0x3333333333333333333333333333333333333333
set $newMinter 0x4444444444444444444444444444444444444444
set $governor 0x5555555555555555555555555555555555555555

governor:queue $governor "Rotate token minter" (
  acl:grant MINTER_ROLE on $token to $newMinter
  acl:revoke MINTER_ROLE on $token from $oldMinter
)
```

`Queued` does not mean ready immediately. Wait until the timelock's execution
time, then run this as a separate transaction:

```evml
load governor
load acl

set $token 0x1111111111111111111111111111111111111111
set $oldMinter 0x3333333333333333333333333333333333333333
set $newMinter 0x4444444444444444444444444444444444444444
set $governor 0x5555555555555555555555555555555555555555

governor:execute $governor "Rotate token minter" (
  acl:grant MINTER_ROLE on $token to $newMinter
  acl:revoke MINTER_ROLE on $token from $oldMinter
)
```

Confirm the proposal is `Executed` and use the role inspection helpers again
to check the new minter and the revoked account. To govern an application call,
put its `exec` command in the proposal block; the timelock then needs the
function's operational role as well.

## Other access-control options

The `acl` module also supports these OpenZeppelin patterns:

- **Ownable and Ownable2Step.** A single owner controls protected functions.
  Use `acl:transfer-ownership` to transfer or stage ownership; with Ownable2Step,
  the pending owner must call `acl:accept-ownership`. `@acl:owner` and
  `@acl:pendingOwner` inspect the handover. If the pending owner is a Safe or
  timelock, acceptance must execute through that account.
- **AccessControlEnumerable.** The same grants and revocations apply, with
  additional contract getters for listing members. Base AccessControl does not
  enumerate members on-chain; use its grant and revoke events instead.
- **AccessControlDefaultAdminRules.** Ordinary roles use the same commands, but
  the default admin is a single account with a delayed two-step transfer.
  `acl:begin-default-admin-transfer` starts it and
  `acl:accept-default-admin-transfer` completes it from the pending admin after
  the delay. The module also supports cancellation and delay changes. Ordinary
  default-admin grants and revocations cannot replace this flow.
- **AccessManager and AccessManaged.** An authority manages numeric roles and
  permissions across multiple contracts, with execution delays. Use numeric
  role ids with `acl:grant` and `acl:revoke`; `--delay` sets a member's execution
  delay. `acl:set-target-function-role` assigns selectors,
  `acl:set-role-admin` and `acl:set-role-guardian` configure role management,
  and `acl:schedule`, `acl:execute-scheduled`, and `acl:cancel-scheduled` handle
  delayed operations. Membership alone does not imply immediate execution.

See the [ACL reference](../reference/acl/index.md) for the commands and
OpenZeppelin's [access API](https://docs.openzeppelin.com/contracts/5.x/api/access)
for the contract semantics. `acl:set-role-admin` applies to AccessManager;
standard AccessControl only exposes `_setRoleAdmin` internally.

## Manage proxy upgrades

Application roles and upgrade authority are separate. A Safe that can manage
minters cannot necessarily upgrade the token. First identify the deployment's
proxy pattern and its upgrade controller:

| Proxy pattern | Upgrade authority | EVMcrispr command |
| --- | --- | --- |
| OpenZeppelin transparent proxy with ProxyAdmin | Owner of the ProxyAdmin contract | `proxies:upgrade` |
| UUPS | Whatever the implementation's `_authorizeUpgrade` requires, often an owner or `UPGRADER_ROLE` | `proxies:upgrade` |
| Beacon proxy | Owner of the UpgradeableBeacon | `proxies:upgrade-beacon` |
| ERC-1167 clone | Fixed implementation; no standard upgrade mechanism | `proxies:clone` deploys a new instance |

For transparent proxies, granting an application admin role does not transfer
ProxyAdmin ownership. For UUPS, grant the actual upgrade role at the proxy if
that is how `_authorizeUpgrade` is implemented; `UPGRADER_ROLE` is not a
universal OpenZeppelin role. See the [OpenZeppelin proxy API](https://docs.openzeppelin.com/contracts/5.x/api/proxy).

### Inspect the implementation and controller

For an OpenZeppelin v5 transparent proxy with a ProxyAdmin:

```evml
load proxies
load acl

set $proxy 0x1111111111111111111111111111111111111111
set $proxyAdmin @proxies:admin($proxy)

print "Implementation:" @proxies:implementation($proxy)
print "ProxyAdmin:" $proxyAdmin
print "Upgrade controller:" @acl:owner($proxyAdmin)
```

`@proxies:admin` reads the ERC-1967 admin slot and fails if it is empty, as it
normally is on UUPS proxies. For a beacon proxy, use `@proxies:beacon` to find
the beacon and `@acl:owner` on that beacon. `@proxies:implementation` follows
the beacon when present.

To move transparent-proxy upgrade authority to a Safe or timelock, the current
ProxyAdmin owner uses `acl:transfer-ownership` on the **ProxyAdmin**, not the
application proxy. Beacon ownership is managed on the beacon itself.

### Upgrade through a Safe

Deploy and validate the new implementation first. This example assumes the
Safe owns the ProxyAdmin, or satisfies the UUPS implementation's upgrade check:

```evml
load safe
load proxies

set $proxy 0x1111111111111111111111111111111111111111
set $safe 0x2222222222222222222222222222222222222222
set $implementationV2 0x6666666666666666666666666666666666666666

safe:propose $safe (
  proxies:upgrade $proxy to $implementationV2 "initializeV2(uint256)" 42
) --origin "Upgrade token to V2"
```

The optional signature and arguments encode a call to the new implementation
through the proxy as part of the upgrade. Use your actual reinitializer and
arguments. If V2 needs no initialization, omit the signature and arguments on
a compatible v5 deployment. Approve and execute the Safe transaction using
the same workflow as the role changes above.

[`proxies:upgrade`](../reference/proxies/commands/upgrade.md) inspects ERC-1967
slots when preparing the action: a contract admin is treated as a ProxyAdmin
and receives `upgradeAndCall`; otherwise the UUPS path calls
`upgradeToAndCall` on the proxy. This is routing, not upgrade validation.
Custom proxy controllers may need explicit `exec` calls. Older OpenZeppelin
interfaces can treat empty initialization calldata differently; check the
deployed version before using a no-initializer upgrade.

### Upgrade through Governor

The timelock must own the ProxyAdmin or meet the UUPS upgrade authorization.
Use the same upgrade command in a Governor proposal:

```evml
load governor
load proxies

set $proxy 0x1111111111111111111111111111111111111111
set $governor 0x5555555555555555555555555555555555555555
set $implementationV2 0x6666666666666666666666666666666666666666

governor:propose $proposalId $governor "Upgrade token to V2" (
  proxies:upgrade $proxy to $implementationV2 "initializeV2(uint256)" 42
)
print "Proposal id:" $proposalId
```

Vote, queue, and execute as in the role-change lifecycle. For queueing and
execution, replace `governor:propose $proposalId` with `governor:queue` or
`governor:execute`, keeping this upgrade proposal's description and block.
Keep the implementation address and initializer fixed, and verify that proxy
admin resolution still produces the original target and calldata.

### Upgrade a beacon

When the Safe owns an UpgradeableBeacon, prepare its upgrade directly:

```evml
load safe
load proxies

set $safe 0x2222222222222222222222222222222222222222
set $beacon 0x7777777777777777777777777777777777777777
set $implementationV2 0x6666666666666666666666666666666666666666

safe:propose $safe (
  proxies:upgrade-beacon $beacon to $implementationV2
)
```

Every proxy using that beacon switches implementation together. This command
does not initialize each proxy's state. If individual proxies need migration
calls, plan those explicitly with the new implementation. A timelock-owned
beacon uses the same command inside the Governor lifecycle.

### Verify an upgrade

EVMcrispr encodes the upgrade transaction; it does not check storage-layout
compatibility or validate your initializer. Validate the implementation with
your OpenZeppelin upgrade tooling, including storage layout and initialization
requirements, before proposing it. See [Writing Upgradeable Contracts](https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable).

Use the [simulation guide](simulation.md) to rehearse the calls with the actual
executor's permissions. After confirmed execution, read
`@proxies:implementation` again and check the application's roles and migrated
state at the proxy address. A successfully created proposal alone proves
neither that the upgrade has run nor that the resulting state is correct.
