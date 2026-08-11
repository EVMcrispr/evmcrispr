---
title: "@orElse"
---

The value of the first read, or the second one when the first reverts.

**On-chain (`@orElse!`)**: Both branches must resolve to the same kind of value, and a constant fallback must fit in one word.

**Returns**: `any`

## Syntax

```evml
@orElse(primary fallback)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `primary` | `any` | The read to try first — a `::` call, chain, or helper |
| `fallback` | `any` | The value to use when the first read reverts |

## Examples

```evml
# Read a value, with a fallback for contracts that lack it
set $d @orElse(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d::{decimals()(uint8)} 18)
print $d
```

<!-- HAND-WRITTEN -->

## Notes

- The first branch must be a live read: a constant cannot fail, so its
  fallback would be unreachable code that reads like a safety net.
- Only a revert (or a call into an address with no code) selects the
  fallback. A missing ABI, an unknown variable or an unreachable node still
  throw — burying those would make every broken read look like a contract
  that merely lacks the method.
- Neither branch is resolved before the helper runs, and the fallback is
  only resolved if it is needed.
- A fallback that papers over a failure weakens whatever is asserted on the
  result. Reach for [@reverts](reverts.md) when the failure itself is the
  thing worth observing.

## See Also

- [@reverts](reverts.md), [assert](../commands/assert.md)

## On-chain face (@orElse!)

Compiles to the core's `orElse(a, b)` primitive: resolve `a`, and let any
revert inside it select `b`.

Both branches must resolve to the same kind of value, since the core passes
whichever one resolved through as raw bytes and the judge compares it
without knowing which branch it came from. Signed and unsigned are the one
pair that mixes freely, because they share a word encoding. A constant
fallback is spliced as one raw word, so it can be a number, a bool, an
address or a `bytes32` — a string or bytes fallback has to be read
on-chain.

This is the only way to guard a comparison on a read that may revert.
Writing the guard as `@bool!(not @reverts!(x) and x <= 18)` does not work:
`and` is an Operators call, so the core resolves BOTH operands before
combining them, and `x` reverting takes the assertion down before the
probe's answer is ever read. It also names `x` twice, and an `InputParam`
is a tree, not a DAG — the repeated operand is duplicated in the calldata
AND resolved again at judge time. `@orElse!` resolves the first branch
once, and the revert never escapes it.

### Usage

```evml
# Prefer the vault's own preview, fall back to the linear conversion
assert @orElse!(0x1E80A006ce9B0F42a1E1AAf47e6e63e63aae60d5::{previewRedeem(uint256)(uint256) 1000000000000000000} 0x1E80A006ce9B0F42a1E1AAf47e6e63e63aae60d5::{convertToAssets(uint256)(uint256) 1000000000000000000}) >= 1000000000000000000

# Bound a view that a non-standard token may not implement: the fallback
# stands in for the missing read, so the comparison always has a value
assert @bool!(@orElse!(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d::{decimals()(uint8)} 18) <= 18)
```
