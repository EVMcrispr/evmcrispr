---
title: "safe:delegate-exec"
---

Call a contract function via DELEGATECALL from the Safe. The code runs in the storage context of the Safe — only use audited libraries you trust.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: build-time inputs only. Only exact static delegatecalls are supported; the composability executor cannot represent dynamic delegatecalls.

## Syntax

```evml
safe:delegate-exec <contractAddress> <signature> [...params]
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `contractAddress` | `address` | Build time | Target library/contract address |
| `signature` | `write-abi` | Build time | Function signature (e.g. `"signMessage(bytes)"`) |
| `[...params]` | `any` | Build time | Arguments matching the signature types |

<!-- HAND-WRITTEN -->

## Examples

Sign a message on behalf of the Safe by delegatecalling SignMessageLib:

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
safe:propose $mySafe (
  safe:delegate-exec 0xd53cd0aB83D845Ac265BE939c57F53AD838012c9 signMessage(bytes) @bytes("hello")
)
```

A delegatecall runs arbitrary code in the storage context of the Safe — it
can overwrite owners, modules, or the singleton pointer. Only use audited
libraries you trust. Proposals containing a delegatecall are flagged in the
Safe web UI, and the hosted Transaction Service only accepts them for
whitelisted targets (such as SignMessageLib or MultiSend).

## Simulation

Inside `sim:fork --as $safe`, outside any Safe block, the command runs the
delegatecall from the impersonated Safe itself, so a block can be simulated
as the Safe will run it:

```evml
load safe
load sim

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
sim:fork --as $mySafe (
  safe:delegate-exec 0xd53cd0aB83D845Ac265BE939c57F53AD838012c9 signMessage(bytes) @bytes("hello")
)
```

Inside the library `msg.sender` is the Safe, where on chain it is whoever
executes the Safe transaction. A simulation asked for suggested assertions
pins down, after each delegatecall, everything that decides who controls the
Safe as the run left it: threshold, owners, modules, guards, singleton and
fallback handler.

## See Also

- [@safe:singleton](../helpers/singleton.md)
- [@safe:fallbackHandler](../helpers/fallbackHandler.md)
- [safe:upgrade](./upgrade.md)
