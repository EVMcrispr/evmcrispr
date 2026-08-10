---
title: "@lang:includes"
---

Check whether an array contains an element.

**On-chain (`@lang:includes!`)**: The element may be a build-time constant or a live value; a live string or bytes element has to be hashed first.

**Returns**: `bool`

## Syntax

```evml
@lang:includes(value item)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `array` | Source array |
| `item` | `any` | Element to search for |

<!-- HAND-WRITTEN -->

## See Also

- [@find](find.md) — find the first matching element
- [@filter](filter.md) — keep all matching elements

## On-chain face (@includes!)

Scan the array return of a call for a word, on-chain. Which recipe is
used depends on whether the element is known when the script is built,
because the two are good at different things.

A **constant** element compiles to a `foldWords` over the array's word
payload with an `eq(item, element)` lambda and the Any exit, so the fold
stops at the first match. The element is baked into the lambda template,
which is why it has to be constant — and why this form reads the array
exactly once.

A **live** element cannot be baked into a template, so it compiles to
`lt(wordIndexOf(payload, item), byteLen(payload) / 32)` instead.
`wordIndexOf` carries its needle as an argument rather than as template
bytes, and returns the word count as its not-found sentinel, so any hit
compares strictly smaller.

The live form scans natively instead of paying one external call per
element, but it names the payload twice — and an operand expression has
no way to name a subterm, so the array **resolves twice**, source call
included. That second resolution costs more than the per-element saving
until the array is around ten elements, which is above where owner lists
and cap lists usually sit. Hence the split: the constant form keeps the
single read it always had.

### Examples

```evml
load assertions
load lang

set $safe 0x44fA8E6f47987339850636F88629646662444217

# Constant element: one read, the eq fold
assertions:assert @includes!($safe::{getOwners()(address[])} @me) "not an owner"

# Live element: the guard must still be an owner after the batch rewires it
assertions:assert @includes!($safe::{getOwners()(address[])} $safe::{getGuard()(address)}) "guard is not an owner"
```

### Notes

- Arrays of single-word elements only (uintN/intN, address, bool,
  bytes32). For substring search in strings use `@str.includes!`.
- A live string or bytes element is rejected rather than hashed. Record
  keys travel as digests, so `@lookup!` hashes them; an `address[]` holds
  no digests, so hashing here would search for something the array never
  contains. Hash both sides explicitly if that is what you want.

### See Also

- `assertions:assert`, `@str.includes!`, `@any!`
