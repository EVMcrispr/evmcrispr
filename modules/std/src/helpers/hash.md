---
title: "@hash"
---

Hash a string with keccak256 (default) or sha256, or a hex value as bytes with the `bytes` modes.

**On-chain (`@hash!`)**: Bytes, an address or a bytesN need a `bytes` mode and a string a text mode; a number is refused until an encoder states its bytes.

**Returns**: `bytes32`

## Syntax

```evml
@hash(text algorithm?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `text` | `string` | Text to hash (e.g. a function signature), or a hex value in a `bytes` mode |
| `[algorithm]` | `string` | `keccak256` (default) or `sha256` hash the text; `bytes` (keccak256) or `bytes-sha256` hash a hex value as its bytes |

## Examples

```evml
# Compute a function selector
set $sel @hash("transfer(address,uint256)")

# Hash the ABI encoding of an address as bytes
set $leaf @hash(@abi.encode("address" 0xd0Dd6cEF72143E22cCED4867eb0d5F2328715533) bytes)

# Hash with sha256 instead of keccak256
set $digest @hash("an example" sha256)
```

<!-- HAND-WRITTEN -->

## See Also

- [@namehash](../../../ens/src/helpers/namehash.md) — ENS namehash
- [@abi.encodeCall](abi.encodeCall.md) — encode a full function call

## Modes

The second argument says how the value is read and which function hashes it.

| Mode | Reads the value as | Function |
|------|--------------------|----------|
| `keccak256` (default) | text | keccak256 |
| `sha256` | text | sha256 |
| `bytes` | bytes | keccak256 |
| `bytes-sha256` | bytes | sha256 |

Text is hashed as its UTF-8 bytes, so `@hash(0x1234)` hashes the six
characters `0x1234`. In a bytes mode a hex value is hashed as the bytes it
spells, so `@hash(0x1234 bytes)` hashes two bytes and `@hash(@me bytes)`
hashes the 20 bytes of your address. A value that is not hex, a number
included, is refused in a bytes mode.

## On-chain face (@hash!)

The digest of a value computed on-chain: keccak256 through the Operations
`hash`, sha256 through a `rawCall` to the SHA-256 precompile (0x02) with the
digest unwrapped from the returned bytes envelope. The decoded value is
hashed, not its ABI envelope. A constant value is hashed when the script is
built.

The mode has to match the value, so that both faces compute the same digest:

- A string (a call returning `string`, or a face that builds one such as
  `@str.lower!`) takes a text mode: the default, `keccak256` or `sha256`.
- Bytes (a call returning `bytes`, or a face that builds bytes such as
  `@abi.encode!`, `@abi.encodePacked!`, `@bytes.concat!`, `@bytes.slice!` or
  `@contracts:codeAt!`) take `bytes` or `bytes-sha256`.
- An address or a fixed-size `bytesN` value takes `bytes` or `bytes-sha256`
  and is hashed as its own bytes: 20 for an address, N for a `bytesN`. This is
  the digest of its packed encoding, and what `@hash` computes off-chain for
  the same value.

A mismatch is refused, and the message names the mode to use.

```evml
set $registry 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1
set $leaf 0x0102030405060708091011121314151617181920212223242526272829303132

# keccak256 of the 20 address bytes, like keccak256(abi.encodePacked(owner))
assert @hash!($registry::!{owner()(address)} bytes) == $leaf

# keccak256(abi.encode(owner)): the 32-byte ABI word, a different digest
assert @hash!(@abi.encode!("address" $registry::!{owner()(address)}) bytes) == $leaf

# A string return keeps the default mode
assert @hash!($registry::!{name()(string)}) == @hash("Registry")
```

Use the explicit encoders when the bytes to hash are not the value's own:

- `@abi.encode!` for the 32-byte ABI word of an address or a `bytesN`, and for
  several values hashed together the way `keccak256(abi.encode(a, b))` does.
- `@abi.encodePacked!` for several values packed together.
- Either one for a number or a bool, which are refused without an encoder in
  every mode. A number has no width of its own: `0xff` is one byte off-chain
  and a `uint256` is 32 bytes on-chain, so the script says which it means,
  for example `@hash!(@abi.encode!("uint256" $registry::!{nonce()(uint256)}) bytes)`.
- `@abi.encode!` for an array or a tuple, whose only byte form is its ABI
  encoding: `@hash!(@abi.encode!("uint256[]" $registry::!{values()(uint256[])}) bytes)`.

A word produced by another on-chain helper follows the same rule: an address
is hashed as its 20 bytes and the result of `@hash!` as its 32, and any other
word needs an encoder.
