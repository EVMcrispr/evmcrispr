# semaphore module

Semaphore v4 anonymous signaling for EVML scripts: wallet-derived zero-knowledge identities, on-chain group management against the canonical singleton, and membership proofs with the production ceremony artifacts - built on the circom module.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

```evml
load semaphore
```

## Configuration variables

Config variables are set with `set` (fully qualified, including the module prefix) and are only readable by their own module and the user script.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `$semaphore:address` | `address` | — | Semaphore v4 contract address override (default: the canonical singleton, same address on every supported chain). |
| `$semaphore:deployBlock` | `number` | — | Block the Semaphore contract was deployed at, bounding member event scans on chains without a built-in entry. |

## Commands

| Command | Description |
|---------|-------------|
| [semaphore:add-member](src/commands/add-member.md) | Add an identity commitment (or an array of them) to a Semaphore group. Only the group admin can execute the resulting transaction. |
| [semaphore:create-group](src/commands/create-group.md) | Create a Semaphore group on the canonical contract and bind the predicted group id to <variable>. Without --admin the transaction sender becomes the admin (correct through Safes and forwarders). |
| [semaphore:identity](src/commands/identity.md) | Derive a Semaphore v4 identity and bind its public commitment to <variable>. The connected wallet signs a fixed message and the signature seeds the identity - deterministic per wallet, recoverable anywhere by re-signing. The secret never leaves module memory. |
| [semaphore:prove](src/commands/prove.md) | Prove membership in a Semaphore group anonymously, signaling a message nullified per scope, and bind the proof JSON to <variable>. Uses the production ceremony artifacts for the group's tree depth. Requires an identity derived this session (semaphore:identity). |
| [semaphore:remove-member](src/commands/remove-member.md) | Remove an identity commitment from a Semaphore group (the leaf becomes 0; the tree keeps its size). Computes the required Merkle siblings from the reconstructed member set — they go stale if the group changes before execution. |
| [semaphore:validate](src/commands/validate.md) | Validate a Semaphore membership proof on-chain. The contract records the nullifier, so a second proof with the same identity and scope reverts. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@semaphore:depth](src/helpers/depth.md) | `number` | The current depth of a Semaphore group's member tree. |
| [@semaphore:members](src/helpers/members.md) | `array` | The ordered member commitments of a Semaphore group, reconstructed from contract events and checked against the on-chain root. Removed members appear as 0. |
| [@semaphore:nullifier](src/helpers/nullifier.md) | `number` | The nullifier a stored identity produces for a scope (poseidon of the hashed scope and the identity secret) — what the contract records on validateProof; useful to check whether a signal was already sent. |
| [@semaphore:root](src/helpers/root.md) | `number` | The current Merkle root of a Semaphore group's member tree. |
| [@semaphore:size](src/helpers/size.md) | `number` | The number of leaves in a Semaphore group's member tree (removed members keep their slot as 0). |
| [@semaphore:verify](src/helpers/verify.md) | `bool` | Check a Semaphore membership proof against a group with the contract's view verifier — no transaction and no nullifier recording. |

