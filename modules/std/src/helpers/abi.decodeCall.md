---
title: "@abi.decodeCall"
---

Decode calldata into `[contract signature [args]]` with human-readable EVML values.

**On-chain (`@abi.decodeCall!`)**: Takes an inline signature and a lens instead of fetching an ABI; checks the selector on-chain (a mismatch reverts) and returns only the selected argument.

**Returns**: `any`

## Syntax

```evml
@abi.decodeCall(contract calldata)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `contract` | `address` | Contract the calldata targets (its verified ABI is used) |
| `calldata` | `bytes` | Full calldata including the 4-byte function selector |

## Examples

```evml
# Decode a token transfer
set [$to $sig $args] @abi.decodeCall(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d 0xa9059cbb000000000000000000000000000000000000000000000000000000000000dead0000000000000000000000000000000000000000000000000de0b6b3a7640000)
print $sig
```

<!-- HAND-WRITTEN -->

## On-chain face

`@abi.decodeCall!` judges a live calldata blob: a queued Safe transaction, a
timelock payload, a governor action. It takes a different argument shape
than the off-chain face, because nothing can fetch an ABI at judge time —
the signature comes inline, the bang convention `::!` also follows:

```evml novalidate
@abi.decodeCall!(<calldata expression> name(argTypes) [_ $])
```

- **The signature is inline and the selector is CHECKED.** Decoding foreign
  calldata as the wrong function would read plausible garbage (an `approve`
  decoded as `transfer` yields a well-formed address), so the compiled form
  compares the calldata's first four bytes against the declared signature's
  selector and reverts on mismatch — the failure carries the actual
  selector found.
- **A `[_ $]` lens is required**, selecting one call argument; array
  selections are refused, and the calldata argument must be a live call or
  bytes expression.

```evml
# The queued transaction transfers to the treasury, whatever the amount
assert @abi.decodeCall!(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d::{queuedCalldata()(bytes)} transfer(address,uint256) [$ _]) == @token(DAI)
```

The argument words of calldata sit four bytes off word alignment, so the
compiled form slices the selector away with a live length, re-enters the
realigned args tuple through the core's `PAYLOAD` sentinel, and navigates
the signature's input types. The calldata expression is resolved more than
once along the way (the length read, the slice, the selector check): the
cost of expressions being trees, paid per assertion.

## See Also

- [@abi.encodeCall](abi.encodeCall.md) — the inverse: encode a call from signature and args
- [@abi.decode](abi.decode.md) — decode raw ABI data given a type list
- [@ens](ens.md) — resolve the `@ens(name)` values back to addresses
