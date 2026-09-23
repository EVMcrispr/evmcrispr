# safe module

Safe multisig operations: propose and execute transactions, manage owners and threshold, attach guards, and install Zodiac modules.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

```evml
load safe
```

## Configuration variables

Config variables are set with `set` (fully qualified, including the module prefix) and are only readable by their own module and the user script.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `$safe:serviceUrl` | `string` | — | Custom Safe transaction-service endpoint for the current chain. |
| `$safe:apiKey` | `string` | — | API key sent to the Safe transaction service. |

## Commands

| Command | Description |
|---------|-------------|
| [safe:add-owner](src/commands/add-owner.md) | Add an owner to the Safe, optionally updating the threshold (keeps the current one by default). |
| [safe:change-threshold](src/commands/change-threshold.md) | Change the signature threshold of the Safe. |
| [safe:confirm](src/commands/confirm.md) | Confirm a Safe transaction or Safe message queued on the Safe Transaction Service, as an owner or through an owner Safe. |
| [safe:confirm-offline](src/commands/confirm-offline.md) | Sign a Safe transaction or Safe message as an owner, or through an owner Safe, and bind the signed JSON to a variable without posting it to the Safe Transaction Service. |
| [safe:confirm-onchain](src/commands/confirm-onchain.md) | Confirm a Safe transaction or Safe message on-chain with approveHash, as an owner or through an owner Safe you complete alone, instead of signing it off-chain. |
| [safe:delegate-exec](src/commands/delegate-exec.md) | Call a contract function via DELEGATECALL from the Safe. The code runs in the storage context of the Safe — only use audited libraries you trust. |
| [safe:disable-module](src/commands/disable-module.md) | Disable a module on the Safe. |
| [safe:enable-module](src/commands/enable-module.md) | Enable a module on the Safe, allowing it to execute transactions without owner signatures (e.g. a Zodiac module). |
| [safe:execute](src/commands/execute.md) | Execute a Safe transaction on-chain from a command block, the safeTxHash of a confirmed queued transaction, or signed Safe transaction JSON. |
| [safe:install-delay](src/commands/install-delay.md) | Deploy a Zodiac Delay modifier (timelock) owned by the Safe and enable it as a module. |
| [safe:install-roles](src/commands/install-roles.md) | Deploy a Zodiac Roles modifier (fine-grained permissions) owned by the Safe and enable it as a module. |
| [safe:install-scope-guard](src/commands/install-scope-guard.md) | Deploy a Zodiac ScopeGuard owned by the Safe and set it as the transaction guard of the Safe, limiting which targets and functions owners can call. |
| [safe:new](src/commands/new.md) | Deploy a new Safe (v1.5.0 L2 singleton) with the given owners, at a deterministic address. |
| [safe:propose](src/commands/propose.md) | Queue a Safe transaction, rejection or Safe message on the Safe Transaction Service: a command block, cancel or a message signed by the wallet, or signed JSON. |
| [safe:propose-offline](src/commands/propose-offline.md) | Create an unsigned Safe transaction, rejection or Safe message without the Safe Transaction Service and bind its JSON to a variable, for owners to sign with safe:confirm-offline. |
| [safe:remove-guard](src/commands/remove-guard.md) | Remove the transaction guard of the Safe. |
| [safe:remove-owner](src/commands/remove-owner.md) | Remove an owner from the Safe, lowering the threshold if it would exceed the remaining owners. |
| [safe:set-fallback-handler](src/commands/set-fallback-handler.md) | Set the fallback handler contract of the Safe. |
| [safe:set-guard](src/commands/set-guard.md) | Set a transaction guard on the Safe: a contract that checks every transaction before and after execution (e.g. a Zodiac ScopeGuard). |
| [safe:swap-owner](src/commands/swap-owner.md) | Replace an owner of the Safe with a new address. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@safe:address](src/helpers/address.md) | `address` | Predict the single-owner Safe address for safe:new with a deployment salt nonce, without RPC access. |
| [@safe:guard](src/helpers/guard.md) | `address` | Transaction guard address of a Safe (the zero address when no guard is set). |
| [@safe:isOwner](src/helpers/isOwner.md) | `bool` | Whether an address is an owner of a Safe. |
| [@safe:merge](src/helpers/merge.md) | `string` | Merge signatures into a Safe transaction or Safe message without network access: matching signed JSON, EOA signatures, or explicit contract signatures. Current authorization is checked by verify and execute. |
| [@safe:modules](src/helpers/modules.md) | `array` | Enabled module addresses of a Safe. |
| [@safe:nonce](src/helpers/nonce.md) | `number` | Current nonce of a Safe. |
| [@safe:owners](src/helpers/owners.md) | `array` | Owner addresses of a Safe. |
| [@safe:signature](src/helpers/signature.md) | `bytes` | Packed owner signatures of a Safe transaction or Safe message once enough owners have signed, e.g. the EIP-1271 signature a dapp asks for. |
| [@safe:threshold](src/helpers/threshold.md) | `number` | Signature threshold of a Safe. |
| [@safe:verify](src/helpers/verify.md) | `string` | Verification report of a Safe transaction or Safe message as JSON: integrity-checked hashes, decoded calls, warnings, owner signature checks, on-chain approvals, readiness and competing transactions. |

