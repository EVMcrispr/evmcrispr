---
title: "@abi.encodeCall"
---

ABI-encode a function call from its signature and arguments.

**On-chain (`@abi.encodeCall!`)**: The signature must be constant; up to four live arguments may include arrays and tuples.

**Returns**: `bytes`

## Syntax

```evml
@abi.encodeCall(signature ...params)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `signature` | `write-abi` | Function signature (e.g. `transfer(address,uint256)`) |
| `[...params]` | `any` | Arguments to encode |

## Examples

```evml
# Encode a transfer call
set $data @abi.encodeCall("transfer(address,uint256)" 0x44fA8E6f47987339850636F88629646662444217 100e18)
```

<!-- HAND-WRITTEN -->

## On-chain face (@abi.encodeCall!)

The function signature stays constant. Live values, including arrays and tuples,
are canonically ABI-encoded before the function selector is prepended. Integer
ABI arguments require exact integral values in the destination type's range.
