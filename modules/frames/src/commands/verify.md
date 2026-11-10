---
title: "frames:verify"
---

Write one VERIFY frame of a frame transaction: a static call to the target that approves the transaction. Only works inside `frames:tx`.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: cannot be nested. A frame transaction is its own transaction; it cannot run inside a smart batch.

## Syntax

```evml
frames:verify <target> [signature] [...params]
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `target` | `address` | Runtime in smart blocks | Account that runs the verification (`@me` for the sender's own) |
| `[signature]` | `write-abi` | Build time | Function signature (e.g. `"verify()"`); none sends no data |
| `[...params]` | `any` | Runtime in smart blocks | Arguments matching the signature types |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--approve` | `string` | Build time | What the frame approves: `execution`, `payment` or `both` (required) |
| `--gas` | `number` | Build time | Gas limit of the frame (default 30,000 when the target is the sender, 50,000 otherwise) |

<!-- HAND-WRITTEN -->

## How it works

`verify` writes one VERIFY frame inside [frames:tx](tx.md): a static call to its target, which must itself approve the transaction. `--approve` names the scope the frame permits (what its flags say), not something EVMcrispr does. A verify cannot be batched and must come before the transaction's calls.

```evml
load frames [tx verify]

tx (
  verify @me --approve execution
  verify 0x0000000000000000000000000000000000000002 "verify()" --approve payment
  exec 0x0000000000000000000000000000000000000001 "f()"
)
```
