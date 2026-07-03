---
title: "safe:exec"
---

Execute a Safe transaction on-chain: either a block of commands (connected owner of a 1-threshold Safe) or a fully-confirmed queued transaction by its hash.

## Syntax

```evml
safe:exec <safe> <proposal>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `safe` | `address` | Safe address |
| `proposal` | `block \| bytes32` | Commands composing the transaction, or the safeTxHash of a queued transaction |

<!-- HAND-WRITTEN -->

## Examples

Execute directly when the connected account is an owner of a 1-threshold Safe
(the owner pre-validated signature is used, no off-chain queue involved):

```evml
load safe

safe:exec $mySafe (
  exec @token(DAI) transfer(address,uint256) $receiver 100e18
  safe:change-threshold 2
)
```

Execute a queued transaction that has collected enough confirmations on the
Safe Transaction Service, by its safeTxHash:

```evml
load safe

safe:exec $mySafe 0x2c9c1f8f2a816f9ffe3ee902e08c02e01e9060e353fa892ee7d1cf27454935cb
```

## See Also
