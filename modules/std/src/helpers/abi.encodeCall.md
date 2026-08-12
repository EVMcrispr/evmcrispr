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

## On-chain face (@abi.encodeCall!)

The signature is a constant, so the selector seeds the first constant run
and each argument appends its 32-byte head word — one `concat` for the
whole calldata value. Live arguments must be elementary static types, at
most 4 per call; all-constant calls fold at composition.

This is not the `::!` chain operator wearing a new name: `::!` PERFORMS a
constructed read, while this face produces the calldata as a bytes VALUE —
for comparing against stored payloads (a timelock's queued call, a
multisig's proposed transaction) rather than executing anything.

## See Also

- [@abi.decodeCall](abi.decodeCall.md) — the inverse: decode calldata into `[contract sig [args]]`
- [send](../commands/send.md) — send pre-encoded calldata
- [exec](../commands/exec.md) — call by signature (auto-encodes)
- [@hash](hash.md) — compute a function selector
