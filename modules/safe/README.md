# safe module

Safe multisig operations: propose and execute transactions, manage owners and threshold, attach guards, and install Zodiac modules.

```evml
load safe
```

## Commands

| Command | Description |
|---------|-------------|
| [safe:add-owner](src/commands/add-owner.md) | Add an owner to the Safe, optionally updating the threshold (keeps the current one by default). |
| [safe:change-threshold](src/commands/change-threshold.md) | Change the signature threshold of the Safe. |
| [safe:delegate-exec](src/commands/delegate-exec.md) | Call a contract function via DELEGATECALL from the Safe. The code runs in the storage context of the Safe — only use audited libraries you trust. |
| [safe:disable-module](src/commands/disable-module.md) | Disable a module on the Safe. |
| [safe:enable-module](src/commands/enable-module.md) | Enable a module on the Safe, allowing it to execute transactions without owner signatures (e.g. a Zodiac module). |
| [safe:execute](src/commands/execute.md) | Execute a Safe transaction on-chain: either a block of commands (connected owner of a 1-threshold Safe) or a fully-confirmed queued transaction by its hash. |
| [safe:install-delay](src/commands/install-delay.md) | Deploy a Zodiac Delay modifier (timelock) owned by the Safe and enable it as a module. |
| [safe:install-roles](src/commands/install-roles.md) | Deploy a Zodiac Roles modifier (fine-grained permissions) owned by the Safe and enable it as a module. |
| [safe:install-scope-guard](src/commands/install-scope-guard.md) | Deploy a Zodiac ScopeGuard owned by the Safe and set it as the transaction guard of the Safe, limiting which targets and functions owners can call. |
| [safe:new](src/commands/new.md) | Deploy a new Safe (v1.4.1 L2 singleton) with the given owners, at a deterministic address. |
| [safe:propose](src/commands/propose.md) | Propose a transaction to the Safe queue through the Safe Transaction Service, signed by the connected owner or delegate. |
| [safe:remove-guard](src/commands/remove-guard.md) | Remove the transaction guard of the Safe. |
| [safe:remove-owner](src/commands/remove-owner.md) | Remove an owner from the Safe, lowering the threshold if it would exceed the remaining owners. |
| [safe:set-fallback-handler](src/commands/set-fallback-handler.md) | Set the fallback handler contract of the Safe. |
| [safe:set-guard](src/commands/set-guard.md) | Set a transaction guard on the Safe: a contract that checks every transaction before and after execution (e.g. a Zodiac ScopeGuard). |
| [safe:swap-owner](src/commands/swap-owner.md) | Replace an owner of the Safe with a new address. |
| [safe:verify](src/commands/verify.md) | Recompute the EIP-712 domain, message and safeTxHash of a queued Safe transaction locally, check them against the Safe Transaction Service and flag dangerous fields, so signers can verify what their wallet displays. |
| [safe:verify-message](src/commands/verify-message.md) | Compute the EIP-712 hashes of an off-chain Safe message (plain string or typed-data JSON) so signers can verify what their wallet displays. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@safe:guard](src/helpers/guard.md) | `address` | Return the transaction guard address of a Safe (the zero address when no guard is set). |
| [@safe:isOwner](src/helpers/isOwner.md) | `bool` | Return whether an address is an owner of a Safe. |
| [@safe:messageHash](src/helpers/messageHash.md) | `bytes32` | Return the SafeMessage hash of an off-chain message (plain string or typed-data JSON), as signed by Safe owners or SignMessageLib. |
| [@safe:modules](src/helpers/modules.md) | `array` | Return the enabled module addresses of a Safe. |
| [@safe:nonce](src/helpers/nonce.md) | `number` | Return the current on-chain nonce of a Safe. |
| [@safe:owners](src/helpers/owners.md) | `array` | Return the owner addresses of a Safe. |
| [@safe:threshold](src/helpers/threshold.md) | `number` | Return the signature threshold of a Safe. |

## Configuration

Config variables are set with `set` (fully qualified, including the module prefix) and are only readable by their own module and the user script.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `$safe:serviceUrl` | `string` | — | Custom Safe transaction-service endpoint for the current chain. |
| `$safe:apiKey` | `string` | — | API key sent to the Safe transaction service. |

