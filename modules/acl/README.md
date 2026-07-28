# acl module

Access control operations: Ownable ownership, AccessControl and AccessManager roles.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

```evml
load acl
```

## Commands

| Command | Description |
|---------|-------------|
| [acl:accept-default-admin-transfer](src/commands/accept-default-admin-transfer.md) | Accept a pending default admin transfer after its schedule has passed. Must be sent by the pending admin. |
| [acl:accept-ownership](src/commands/accept-ownership.md) | Accept a pending ownership transfer of an Ownable2Step contract. Must be sent by the pending owner. |
| [acl:begin-default-admin-transfer](src/commands/begin-default-admin-transfer.md) | Start the delayed two-step transfer of the DEFAULT_ADMIN_ROLE on an AccessControlDefaultAdminRules contract. |
| [acl:cancel-default-admin-transfer](src/commands/cancel-default-admin-transfer.md) | Cancel a pending default admin transfer. Must be sent by the current default admin. |
| [acl:cancel-scheduled](src/commands/cancel-scheduled.md) | Cancel a scheduled AccessManager operation. Callable by its scheduler, a guardian of the required role, or an admin. |
| [acl:change-default-admin-delay](src/commands/change-default-admin-delay.md) | Schedule a change of the delay applied to future default admin transfers. |
| [acl:execute-scheduled](src/commands/execute-scheduled.md) | Execute an operation through an AccessManager, consuming its schedule when the operation was delayed. |
| [acl:grant](src/commands/grant.md) | Grant a role on an AccessControl contract (string roles, hashed with keccak256) or an AccessManager (numeric role ids). |
| [acl:label-role](src/commands/label-role.md) | Attach a human-readable label to an AccessManager role (emitted as an event for off-chain indexing). |
| [acl:renounce](src/commands/renounce.md) | Renounce a role held by the connected account on an AccessControl contract or an AccessManager. |
| [acl:renounce-ownership](src/commands/renounce-ownership.md) | Renounce ownership of an Ownable contract, leaving it without an owner and permanently disabling its onlyOwner functions. |
| [acl:revoke](src/commands/revoke.md) | Revoke a role on an AccessControl contract (string roles, hashed with keccak256) or an AccessManager (numeric role ids). |
| [acl:rollback-default-admin-delay](src/commands/rollback-default-admin-delay.md) | Cancel a scheduled default admin delay change. |
| [acl:schedule](src/commands/schedule.md) | Schedule a delayed operation on an AccessManager for later execution with acl:execute-scheduled. |
| [acl:set-role-admin](src/commands/set-role-admin.md) | Set the admin role that manages grants and revocations of an AccessManager role. |
| [acl:set-role-guardian](src/commands/set-role-guardian.md) | Set the guardian role allowed to cancel scheduled operations of an AccessManager role. |
| [acl:set-target-closed](src/commands/set-target-closed.md) | Close or reopen a contract managed by an AccessManager. While closed, all calls to its restricted functions revert. |
| [acl:set-target-function-role](src/commands/set-target-function-role.md) | Map functions of a managed contract to the AccessManager role required to call them. |
| [acl:transfer-ownership](src/commands/transfer-ownership.md) | Transfer ownership of an Ownable contract. On Ownable2Step contracts this stages the pending owner, who must then accept. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@acl:canCall](src/helpers/canCall.md) | `bool` | Whether a caller can immediately call a restricted function of a contract managed by an AccessManager. |
| [@acl:defaultAdmin](src/helpers/defaultAdmin.md) | `address` | Current default admin of an AccessControlDefaultAdminRules contract. |
| [@acl:defaultAdminDelay](src/helpers/defaultAdminDelay.md) | `number` | Delay in seconds applied to default admin transfers of an AccessControlDefaultAdminRules contract. |
| [@acl:hasRole](src/helpers/hasRole.md) | `bool` | Whether an account holds a role on an AccessControl contract (string roles) or an AccessManager (numeric role ids). |
| [@acl:operationId](src/helpers/operationId.md) | `bytes32` | Operation id of an AccessManager call (hashOperation of caller, target and calldata), for use with @acl:operationSchedule. |
| [@acl:operationSchedule](src/helpers/operationSchedule.md) | `number` | Timestamp at which a scheduled AccessManager operation becomes executable (0 when unset, expired or already executed). |
| [@acl:owner](src/helpers/owner.md) | `address` | Current owner of an Ownable contract. |
| [@acl:pendingDefaultAdmin](src/helpers/pendingDefaultAdmin.md) | `address` | Pending default admin of an AccessControlDefaultAdminRules contract (the zero address when no transfer is in progress). |
| [@acl:pendingOwner](src/helpers/pendingOwner.md) | `address` | Pending owner of an Ownable2Step contract (the zero address when no transfer is in progress). |
| [@acl:roleAdmin](src/helpers/roleAdmin.md) | `bytes32 \| number` | Admin role that controls a role: a bytes32 value on AccessControl contracts, a role id on AccessManagers. |

