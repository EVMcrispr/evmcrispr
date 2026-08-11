---
title: "@abi.decode"
---

Decode ABI-encoded bytes into values given a comma-separated type list; a lens selects one of them.

**On-chain (`@abi.decode!`)**: Needs a [_ $] lens and returns only the selected value; the data argument must be a live call or bytes expression, and array selections are refused.

**Returns**: `any`

## Syntax

```evml
@abi.decode(types data lens?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `types` | `string` | Comma-separated Solidity types (e.g. "uint256,address") |
| `data` | `bytes` | ABI-encoded hex data |
| `[lens]` | `array` | A [_ $] lens selecting one decoded value; without it the whole decoded array is returned |

## Examples

```evml
# Decode a single uint256
set $values @abi.decode("uint256" 0x0000000000000000000000000000000000000000000000000000000000000064)
print $values

# Decode multiple types
set $values @abi.decode("uint256,address" 0x000000000000000000000000000000000000000000000000000000000000002a00000000000000000000000044fa8e6f47987339850636f88629646662444217)
print $values
```

<!-- HAND-WRITTEN -->

## On-chain face

`@abi.decode!` re-enters an encoded blob at judge time. The type list is
the author's claim about the payload's encoding, exactly as a typed `::`
hop's inline ABI is: a wrong claim reverts loudly in almost all cases, but
a shape-compatible wrong claim can read the wrong value. Two things
tighten versus the off-chain face:

- **A `[_ $]` lens is required.** An on-chain expression yields one value,
  so the lens says which decoded value that is — the same `$`/`_`/`...`
  vocabulary a return lens uses, as a separate argument. Nested `[ ]`
  reach into structs; array selections are refused (select an element or a
  string/bytes value instead).
- **`data` must be a live call or bytes expression** — a `::` call whose
  return lens picks a `bytes` field out of a multi-value return, or a
  nested bytes helper. A build-time constant has nothing to assert about;
  decode those with the off-chain face.

```evml
# The report blob encodes (address,uint256); judge its uint on-chain
assert @abi.decode!("address,uint256" 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d::{lastReport()(uint256,bytes)}[_ $] [_ $]) > 0
```

The payload is read in place: the compiled form appends the core's
`PAYLOAD` sentinel to the navigation that reaches the bytes field, and the
selection rides a second `nav` whose descriptor is the claimed type list —
no copying, one extra frame. A `string` selected out of the payload
composes with the string helpers like any other string value.

## See Also

- [@abi.encode](abi.encode.md) — the inverse: ABI-encode values
- [@abi.encodeCall](abi.encodeCall.md) — ABI-encode a function call
- [@abi.encodePacked](abi.encodePacked.md) — packed encoding
