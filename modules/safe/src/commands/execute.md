---
title: "safe:execute"
---

Execute a Safe transaction on-chain: either a block of commands (connected owner of a 1-threshold Safe) or a fully-confirmed queued transaction by its hash.

## Syntax

```evml
safe:execute <safe> <proposal>
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

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
set $receiver 0x4F2083f5fBede34C2714aFfb3105539775f7FE64

safe:execute $mySafe (
  exec @token(DAI) transfer(address,uint256) $receiver 100e18
  change-threshold 2
)
```

Execute a queued transaction that has collected enough confirmations on the
Safe Transaction Service, by its safeTxHash:

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
safe:execute $mySafe 0x2c9c1f8f2a816f9ffe3ee902e08c02e01e9060e353fa892ee7d1cf27454935cb
```

## See Also
