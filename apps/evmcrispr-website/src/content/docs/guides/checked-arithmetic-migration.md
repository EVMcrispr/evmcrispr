---
title: Checked arithmetic and Operators migration
description: Migrate num! expressions and use explicit integer rounding with the updated Operators contracts.
---

EVMcrispr separates exact off-chain calculations from checked integer calculations.

| Helper | Intermediates | Final result |
| --- | --- | --- |
| `num` | Arbitrary-precision rational | Truncated integer |
| `floor` | Arbitrary-precision rational | Integer rounded toward negative infinity |
| `ceil` | Arbitrary-precision rational | Integer rounded toward positive infinity |
| `calc`, `calc!` | Checked uint256/int256 | Integer; `//` truncates toward zero |
| `calcFloor`, `calcFloor!` | Checked integer operands; explicit full-width quotient | Integer rounded toward negative infinity |
| `calcCeil`, `calcCeil!` | Checked integer operands; explicit full-width quotient | Integer rounded toward positive infinity |

The exact helpers check only their final rounded result: nonnegative values must fit
uint256 and negative values must fit int256. Intermediate numerators and denominators
remain arbitrary precision. A nested helper call is a separate rounding boundary.
The SDK's `Num` utility remains arbitrary precision.

```evml
set $exact @num((1 / 2) * 2)
set $integer @calc((1 // 2) * 2)
set $down @floor(-7 / 3)
set $up @calcCeil(7 * 3 / 2)
```

These results are respectively `1`, `0`, `-3`, and `11`.

## Replacing num!

`num!` has been removed. Replace integer arithmetic with `calc!`, changing division
to `//`. `/` is rejected inside ordinary `calc` expressions. Fractional operands,
implicit boolean/string coercion, and automatic decimal-scale alignment are also
rejected. Convert values to raw integer units explicitly.

Use `calcFloor!` or `calcCeil!` when an integer quotient needs a chosen rounding
direction. These accept a root `a / b` or `(a * b) / c`, and integer expressions
without division. The latter quotient computes a 512-bit multiplication before
rounding once. `//` and other division occurrences in the same wrapper are rejected;
nested helpers provide explicit boundaries. Ordinary `calc(a * b // c)` checks the
multiplication before division and can overflow even when a fused quotient fits.

Both checked faces enforce the same operation boundaries, including constant folding.
Negative values and signed ABI returns select int256 arithmetic. Positive values
returned from signed ABI types keep that category through variables and selections.
Mixing unsigned operands into signed arithmetic requires them to fit int256.
`^` is exponentiation with a nonnegative exponent; `xor` is 256-bit bitwise XOR,
with signed results interpreted as two's complement. XOR has lower precedence than
arithmetic. Implicit arithmetic branches in `ifElse` use these checked rules too.
Live `ifElse!` and `orElse!` reject mixed signed/unsigned branches; use matching
categories so selecting a fallback never silently reinterprets its bits.

`num`, `floor`, and `ceil` remain off-chain only. Their constants may be embedded in
on-chain expressions. Existing scripts that relied on `num` returning a fractional
value should combine the calculation into one exact expression and round at its end.
ABI integer arguments now reject fractions instead of silently truncating them,
including fractions nested in tuples and arrays; destination widths are checked.

## Decimal conversion and ABI values

`lang:num.parse` and its `!` face accept optional `trunc`, `floor`, or `ceil` rounding
(default `trunc`) and `signed` or `unsigned` output (default `signed`). Precision is
0–77. They accept ordinary decimal notation, a leading plus sign, `.5`, and `1.`;
spaces, exponent notation, separators, and unsigned negative strings are rejected.
`num.format` and its `!` face trim trailing fractional zeros.

`abi.encode!` and `abi.encodeCall!` support live arrays, strings, and tuples through
the new canonical encoder. Type descriptors and function signatures remain constant. The existing splice
budget allows up to four live top-level values per encoder call; an entire runtime
array counts as one value.
Live scalar narrowing is checked before encoding; ABI types of composite values must
match their destination shapes. The descriptor codec validates ABI layout, not claims
about the behavior of the source contract.

## Typed collections

Collection results carry element types and transport metadata. Word operations retain
their specialized path; dynamic and multiword values use CollectionOperators.
`unique!` now removes all duplicate words while preserving first occurrence; the SDK
retains explicitly named adjacent deduplication. Generic equality can use a callback.
`str.split!` without an index returns an array, and `flat!` flattens one runtime level.

Generic map/filter/fold/sort/distinct callbacks must be named definitions containing
one direct ABI call. Parameters occupy whole argument slots, and the callback returns
one ABI value; return a single tuple for a struct, rather than several separate values.
Concrete ABI parameter/result annotations such as `uint256`, `int256[]`, and
`(uint256,string)` are supported in definition signatures and checked against the
direct call. Existing generic annotations remain valid for compatible word callbacks.
Constant captures and live captures resolved before traversal are supported. Arbitrary
composed multiword callback bodies are rejected. Existing composed word lambdas remain
available.

Runtime `str.join!` accepts string/bytes arrays and constant or live delimiters.
Literal arrays retain the existing four-live-part layout limit.

## Contract artifacts

This integration targets Assertions commit `47d88ed7f8293da0d432fe2447d35e476706170f`:

| Contract | Deterministic address |
| --- | --- |
| Assertions | `0x67DBB438FdC614466984Dc8F68dAB812d785a2aE` |
| Operators | `0x8cffcD084E0305f2CD93772C2fc31D936a9fc868` |
| CollectionOperators | `0xd3F401e4C356667B061B6129755B7a1A279f2e1f` |

These are verified artifact-derived addresses, not a claim of deployment on any chain.
The SDK previously carried an older 12,885-byte Assertions fixture. Its ABI, address,
and fixture are now aligned with the reviewed 13,116-byte core. The contract review
itself did not modify that core. Operators' old three-argument `mulDiv` and `mulDivUp`
selectors are replaced by signed/unsigned four-argument `mulDiv`, with `Trunc=0`,
`Floor=1`, and `Ceil=2`. CollectionOperators requires Cancun opcode support.

Generic ABI collection callbacks cost more gas than word operations. Prefer word paths
when they provide the required semantics, and simulate the final composed expression.

## Collection gas measurements

The integration fixture `modules/lang/test/integration/helpers/collection-gas.test.ts`
estimates complete `Assertions.resolve` calls against the synchronized runtime
bytecodes. These figures include transaction intrinsic gas and compiled calldata,
not just the periphery operation. Inputs are ascending `int256[]` values from a
local constant-returning contract. Generic callbacks are direct ABI calls;
word paths use the specialized Operators functions.

| Operation | 4 words | 4 generic values | 16 words | 16 generic values |
| --- | ---: | ---: | ---: | ---: |
| Sort | 206,129 | 423,257 | 254,135 | 2,045,622 |
| Map (multiply by two) | 165,158 | 466,745 | 189,687 | 1,438,712 |
| Reduce (sum) | 166,967 | 408,553 | 194,547 | 1,285,332 |

These are representative fixtures, not gas bounds. Dynamic payload size,
comparator behavior, source-read costs, and nested composition change the cost.
Use specialized word operations when their semantics suffice.
