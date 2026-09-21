---
title: "safe:execute"
---

Execute a Safe transaction on-chain from a command block, a confirmed service transaction hash, or locally signed transaction JSON with --no-api.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
safe:execute <safe> <proposal>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `safe` | `address` | Safe address |
| `proposal` | `block \| bytes32 \| string` | Commands, the safeTxHash of a queued transaction, or exported transaction JSON with --no-api |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--no-api` | `bool` | Execute a block or exported transaction JSON without contacting the Safe Transaction Service |
| `--signatures` | `array` | EIP-712 owner signatures to add locally (requires --no-api; blocks also require --nonce) |
| `--nonce` | `number` | Nonce signed for a command block (requires --no-api) |

<!-- HAND-WRITTEN -->

## Examples

Execute directly when the connected account is an owner of a 1-threshold Safe
(the owner pre-validated signature is used, no off-chain queue involved):

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
set $receiver 0x4F2083f5fBede34C2714aFfb3105539775f7FE64

safe:execute $mySafe (
  exec @token(DAI) transfer(address,uint256) $receiver 100e18
  safe:change-threshold 2
)
```

Execute a queued transaction that has collected enough confirmations on the
Safe Transaction Service, by its safeTxHash:

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
safe:execute $mySafe 0x2c9c1f8f2a816f9ffe3ee902e08c02e01e9060e353fa892ee7d1cf27454935cb
```

## Without the Safe API

After collecting owner signatures with [safe:propose](propose.md), place the
complete exported JSON in the string variable `$tx` and execute it directly:

```evml novalidate
safe:execute $mySafe $tx --no-api true
```

The executor can be any account. The command checks the chain, Safe address,
transaction hash, current on-chain nonce, owner membership, and threshold.
It recovers and sorts the signers, deduplicates identical signatures, and rejects conflicts or invalid authorization.
RPC access is required, but the Safe Transaction Service is never contacted.
This path accepts EIP-712 EOA signatures and contract-owner signatures, including
nested Safes. It also discovers current on-chain `approveHash` approvals. These
checks use Safe's legacy `isValidSignature(bytes,bytes)` contract-signature
interface. A modern bytes32-only EIP-1271 contract is not sufficient.

The shared executor checks Safe outcome events: `ExecutionFailure` is an error
even when the outer transaction receipt succeeded.

Alternatively, supply individual signatures as an array for an identical
command block. The explicit nonce must be the nonce all owners signed:

```evml novalidate
safe:execute $mySafe (
  safe:change-threshold 2
) --no-api true --nonce 42 --signatures [$signatureA $signatureB]
```

`--signatures` may also add signatures to imported JSON. A nonce override on
imported JSON is rejected. A hash alone cannot be executed with `--no-api true`
because the hash does not contain the transaction data or signatures.

Direct block execution for a threshold-one Safe already avoids the API and
continues to work with or without `--no-api true`.

## See Also

- [safe:propose](propose.md)
- [safe:verify](verify.md)
