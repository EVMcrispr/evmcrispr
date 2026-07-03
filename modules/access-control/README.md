# access-control module

Access control operations: Ownable ownership, AccessControl and AccessManager roles.

```evml
load access-control
```

## Commands

| Command | Description |
|---------|-------------|
| [access-control:accept-default-admin-transfer](src/commands/accept-default-admin-transfer.md) | Accept a pending default admin transfer after its schedule has passed. Must be sent by the pending admin. |
| [access-control:accept-ownership](src/commands/accept-ownership.md) | Accept a pending ownership transfer of an Ownable2Step contract. Must be sent by the pending owner. |
| [access-control:begin-default-admin-transfer](src/commands/begin-default-admin-transfer.md) | Start the delayed two-step transfer of the DEFAULT_ADMIN_ROLE on an AccessControlDefaultAdminRules contract. |
| [access-control:cancel-default-admin-transfer](src/commands/cancel-default-admin-transfer.md) | Cancel a pending default admin transfer. Must be sent by the current default admin. |
| [access-control:cancel-scheduled](src/commands/cancel-scheduled.md) | Cancel a scheduled AccessManager operation. Callable by its scheduler, a guardian of the required role, or an admin. |
| [access-control:change-default-admin-delay](src/commands/change-default-admin-delay.md) | Schedule a change of the delay applied to future default admin transfers. |
| [access-control:execute-scheduled](src/commands/execute-scheduled.md) | Execute an operation through an AccessManager, consuming its schedule when the operation was delayed. |
| [access-control:grant](src/commands/grant.md) | Grant a role on an AccessControl contract (string roles, hashed with keccak256) or an AccessManager (numeric role ids). |
| [access-control:label-role](src/commands/label-role.md) | Attach a human-readable label to an AccessManager role (emitted as an event for off-chain indexing). |
| [access-control:renounce](src/commands/renounce.md) | Renounce a role held by the connected account on an AccessControl contract or an AccessManager. |
| [access-control:renounce-ownership](src/commands/renounce-ownership.md) | Renounce ownership of an Ownable contract, leaving it without an owner and permanently disabling its onlyOwner functions. |
| [access-control:revoke](src/commands/revoke.md) | Revoke a role on an AccessControl contract (string roles, hashed with keccak256) or an AccessManager (numeric role ids). |
| [access-control:rollback-default-admin-delay](src/commands/rollback-default-admin-delay.md) | Cancel a scheduled default admin delay change. |
| [access-control:schedule](src/commands/schedule.md) | Schedule a delayed operation on an AccessManager for later execution with access-control:execute-scheduled. |
| [access-control:set-role-admin](src/commands/set-role-admin.md) | Set the admin role that manages grants and revocations of an AccessManager role. |
| [access-control:set-role-guardian](src/commands/set-role-guardian.md) | Set the guardian role allowed to cancel scheduled operations of an AccessManager role. |
| [access-control:set-target-closed](src/commands/set-target-closed.md) | Close or reopen a contract managed by an AccessManager. While closed, all calls to its restricted functions revert. |
| [access-control:set-target-function-role](src/commands/set-target-function-role.md) | Map functions of a managed contract to the AccessManager role required to call them. |
| [access-control:transfer-ownership](src/commands/transfer-ownership.md) | Transfer ownership of an Ownable contract. On Ownable2Step contracts this stages the pending owner, who must then accept. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@access-control:access-control.canCall](src/helpers/access-control.canCall.md) | `bool` | Whether a caller can immediately call a restricted function of a contract managed by an AccessManager. |
| [@access-control:access-control.defaultAdmin](src/helpers/access-control.defaultAdmin.md) | `address` | Current default admin of an AccessControlDefaultAdminRules contract. |
| [@access-control:access-control.defaultAdminDelay](src/helpers/access-control.defaultAdminDelay.md) | `number` | Delay in seconds applied to default admin transfers of an AccessControlDefaultAdminRules contract. |
| [@access-control:access-control.hasRole](src/helpers/access-control.hasRole.md) | `bool` | Whether an account holds a role on an AccessControl contract (string roles) or an AccessManager (numeric role ids). |
| [@access-control:access-control.operationId](src/helpers/access-control.operationId.md) | `bytes32` | Operation id of an AccessManager call (hashOperation of caller, target and calldata), for use with @access-control.operationSchedule. |
| [@access-control:access-control.operationSchedule](src/helpers/access-control.operationSchedule.md) | `number` | Timestamp at which a scheduled AccessManager operation becomes executable (0 when unset, expired or already executed). |
| [@access-control:access-control.owner](src/helpers/access-control.owner.md) | `address` | Current owner of an Ownable contract. |
| [@access-control:access-control.pendingDefaultAdmin](src/helpers/access-control.pendingDefaultAdmin.md) | `address` | Pending default admin of an AccessControlDefaultAdminRules contract (the zero address when no transfer is in progress). |
| [@access-control:access-control.pendingOwner](src/helpers/access-control.pendingOwner.md) | `address` | Pending owner of an Ownable2Step contract (the zero address when no transfer is in progress). |
| [@access-control:access-control.roleAdmin](src/helpers/access-control.roleAdmin.md) | `bytes32 \| number` | Admin role that controls a role: a bytes32 value on AccessControl contracts, a role id on AccessManagers. |

