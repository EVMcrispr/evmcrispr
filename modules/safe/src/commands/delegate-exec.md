---
title: "safe:delegate-exec"
---

Call a contract function via DELEGATECALL from the Safe. The code runs in the storage context of the Safe — only use audited libraries you trust.

## Syntax

```evml
safe:delegate-exec <contractAddress> <signature> [...params]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `contractAddress` | `address` | Target library/contract address |
| `signature` | `write-abi` | Function signature (e.g. `"signMessage(bytes)"`) |
| `[...params]` | `any` | Arguments matching the signature types |

<!-- HAND-WRITTEN -->

## Examples

Sign a message on behalf of the Safe by delegatecalling SignMessageLib:

```evml
load safe

safe:propose $mySafe (
  safe:delegate-exec 0xd53cd0aB83D845Ac265BE939c57F53AD838012c9 signMessage(bytes) @bytes("hello")
)
```

A delegatecall runs arbitrary code in the storage context of the Safe — it
can overwrite owners, modules, or the singleton pointer. Only use audited
libraries you trust. Proposals containing a delegatecall are flagged in the
Safe web UI, and the hosted Transaction Service only accepts them for
whitelisted targets (such as SignMessageLib or MultiSend).

## See Also
