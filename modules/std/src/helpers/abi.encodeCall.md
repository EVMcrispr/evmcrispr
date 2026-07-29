---
title: "@abi.encodeCall"
---

ABI-encode a function call from its signature and arguments.

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

## See Also

- [@abi.decodeCall](abi.decodeCall.md) — the inverse: decode calldata into `[contract sig [args]]`
- [send](../commands/send.md) — send pre-encoded calldata
- [exec](../commands/exec.md) — call by signature (auto-encodes)
- [@hash](hash.md) — compute a function selector
