---
title: "safe:execute"
---

Execute a Safe transaction on-chain from a command block, the safeTxHash of a confirmed queued transaction, or signed Safe transaction JSON.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: cannot be nested. This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.

Accepts ordinary `(...)` and smart `!(...)` payload blocks. Smart blocks support explicit `@helper!` expressions and returned-value captures.

## Syntax

```evml
safe:execute <safe> <proposal>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `safe` | `address` | Build time | Safe address |
| `proposal` | `block \| bytes32 \| string` | Build time | Commands, the safeTxHash of a queued transaction, or Safe transaction JSON |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--salt` | `bytes32` | Build time | Smart-batch storage salt for reproducible offline signing (block forms with !) |
| `--gas` | `number` | Build time | Gas limit of the execTransaction call, for calls the RPC cannot estimate (e.g. cross-chain ones) |

<!-- HAND-WRITTEN -->

## Examples

Execute a block directly. The connected owner's own approval counts, since the
Safe accepts the sender of `execTransaction` as that owner's approval, so a
threshold-one Safe needs nothing else. On-chain approvals from other owners
([safe:confirm-onchain](confirm-onchain.md)) count as well:

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
set $receiver 0x4F2083f5fBede34C2714aFfb3105539775f7FE64

safe:execute $mySafe (
  exec @token(DAI) transfer(address,uint256) $receiver 100e18
  safe:change-threshold 2
)
```

Execute a queued transaction by its safeTxHash once it has enough
confirmations on the Safe Transaction Service. An owner executing it can
supply the last missing confirmation. If other transactions are queued at the
same nonce, the command lists them before sending:

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
safe:execute $mySafe 0x2c9c1f8f2a816f9ffe3ee902e08c02e01e9060e353fa892ee7d1cf27454935cb
```

## Signed Safe transactions

Execute Safe transaction JSON signed with
[safe:confirm-offline](confirm-offline.md):

```evml novalidate
safe:execute $mySafe $tx
```

The executor can be any account. The command checks the chain, Safe address,
transaction hash, current on-chain nonce, owner membership, and threshold.
It recovers and sorts the signers, deduplicates identical signatures, and rejects conflicts or invalid authorization.
RPC access is required, but the Safe Transaction Service is never contacted.
This path accepts EIP-712 EOA signatures and contract-owner signatures, including
nested Safes. It also discovers current on-chain confirmations
([safe:confirm-onchain](confirm-onchain.md)). These checks use Safe's legacy
`isValidSignature(bytes,bytes)` contract-signature interface. A modern
bytes32-only EIP-1271 contract is not sufficient.

The shared executor checks Safe outcome events: `ExecutionFailure` is an error
even when the outer transaction receipt succeeded.

Only a safeTxHash contacts the service. A command block is built at the
current on-chain nonce and authorized by on-chain confirmations and the
executor itself; to add off-chain signatures, prepare it with
[safe:propose-offline](propose-offline.md) and merge them into the JSON.

## See Also

- [safe:confirm-offline](confirm-offline.md)
- [safe:confirm-onchain](confirm-onchain.md)
- [@safe:verify](../helpers/verify.md)
