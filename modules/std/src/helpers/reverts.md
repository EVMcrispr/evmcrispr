---
title: "@reverts"
---

Whether a live call reverts: true when the chain refuses the call, false when it resolves; `-!>` matches the reason and a lens selects an error argument.

**On-chain (`@reverts!`)**: Bare probes negate the core's `isValid`; error expectations compile to `revertData`, which re-runs the call in-frame — so they need a direct single-hop call.

**Returns**: `any`

## Syntax

```evml
@reverts(call arrow? error? lens?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `call` | `address` | A `::` call expression (or chain, or on-chain helper) to probe |
| `[arrow]` | `string` | `-!>` — expect a specific error |
| `[error]` | `string` | Error signature to match, e.g. `InsufficientBalance(uint256,uint256)` (`Error` and `Panic` work by bare name) |
| `[lens]` | `array` | Lens selecting one error argument as the value, e.g. `[_ $]` |

## Examples

```evml
# Probe whether a view call reverts, at build time
set $missing @reverts(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d::{decimals()(uint8)})
print $missing
```

<!-- HAND-WRITTEN -->

## Notes

- The argument must be a live call (or on-chain helper) — a constant
  cannot fail, so passing one is an error rather than a vacuous `false`.
- Only the CHAIN refusing the read answers `true`: a revert, or a call
  into an address with no code. A missing ABI, an unknown variable or an
  unreachable node still throw, because those are the script or the setup
  being wrong, and reporting them as a revert would turn a typo into a
  measurement.
- The call argument is not resolved before the helper runs — the
  resolution failing is the answer, so `@reverts` receives the expression
  unevaluated.
- Asking the opposite question — that a read still *resolves* — is
  `@bool!(not @reverts!(…))`. It is the rarer of the two: an assertion
  about a value already fails when the read behind it reverts, so a bare
  liveness probe is only needed when there is no value to check.

## The arrow: match the reason

`-!> ErrName(types)` narrows the probe from "does it revert" to "does it
revert WITH THIS ERROR". Write the error signature inline — the types are
what the selector is computed from, and what a lens navigates.
`Error` (the `require` reason string) and `Panic` work by bare name.

```evml
set $failsRight @reverts(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d::{withdraw(uint256)() 100} -!> InsufficientBalance(uint256,uint256))
```

A trailing lens selects one of the error's ARGUMENTS as the value instead
of a boolean — the same `$`/`_` vocabulary a return lens uses, as a
separate space-set argument:

```evml
set $required @reverts(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d::{withdraw(uint256)() 100} -!> InsufficientBalance(uint256,uint256) [_ $])
set $reason @reverts(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d::{withdraw(uint256)() 100} -!> Error(string) [$])
```

Without a lens the answer is a boolean: `true` only when the call reverts
AND the selector matches; a different error, a bare revert, or a call that
resolves all answer `false`. With a lens there is no boolean to fall back
to — a call that resolves or mismatches is an error, because the value the
lens promises does not exist.

`-?!>` has no probe form: an expectation either matches or the probe
fails. To fall back to a value when a read reverts, use
[@orElse](orElse.md).

## See Also

- [assert](../commands/assert.md), [@orElse](orElse.md), [@contracts:codeAt!](../../../contracts/src/helpers/codeAt.md)

## On-chain face (@reverts!)

The bare probe compiles to the negation of the core's `isValid(param)`
primitive: 1 when anything inside the wrapped expression reverts at
assertion time, 0 when it resolves. `assert` folds the negation into an
`Eq 0` constraint on the raw `isValid` operand, so the direct form costs no
extra call; only composing it inside `@bool!` materializes the comparison.

The arrow forms compile to the core's `revertData(param, selector)` — the
reason-carrying probe. It re-performs the call IN ITS OWN FRAME, so the
target's revert data survives (the routes `isValid` and `@orElse!` take
convert a revert into the core's own `CallFailed`, and the reason is
lost). That is also why the arrow demands a DIRECT call: one hop, a
literal target, build-time arguments. A multi-hop chain, a live-argument
read or a `::!` computed head routes through the core, where the reason it
would match has already drowned — the compiler rejects those instead of
matching the wrong error.

On a match the selector is stripped, so the revert payload is a clean ABI
tuple of the error's arguments: a lens navigates them exactly as it
navigates a call's return, and the selected value composes anywhere a read
does — including as the target of a further `::!` read. Asserted bare, an
arrow probe drops its `isValid` wrapper entirely and judges a
zero-constraint entry on `revertData` itself, so a failing assertion
reports `DidNotRevert` or `UnexpectedRevertData(expected, actual)` instead
of a flat constraint failure.

The faces answer the same question at different moments, which is the whole
point of having both: `@reverts` says whether the call fails NOW, while the
script is being built, and is the one to branch on with `if`; `@reverts!`
says whether it fails when the batch executes, and is the one to assert on.
A contract that gets paused, self-destructed or upgraded between the two
makes them disagree, and that gap is usually the thing worth asserting.

Composing `@reverts!` with `and`/`or` inside `@bool!` does NOT make the
other operand safe: the logic operators are Operators calls, so the core
resolves both operands before either is combined, and a revert in the second
one takes the whole assertion down before the first one's answer can be
read. `@reverts!` swallows the revert of its own operand and nothing else.
To guard a comparison on a read that may revert, use [@orElse!](orElse.md).

### Usage

```evml
# Assert that a read still reverts — nobody has approved this allowance,
# and that must remain true. Nothing else can say this: a fallback can mask
# a revert, but it cannot require one.
assert @reverts!(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d::{transferFrom(address,address,uint256)(bool) 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d 1000000000000000000000000000000})

# Not just that it reverts — that it reverts for the RIGHT reason
assert @reverts!(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d::{transferFrom(address,address,uint256)(bool) 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d 1000000000000000000000000000000} -!> InsufficientBalance(uint256,uint256))

# An error argument as a value: the shortfall the revert reports
assert @reverts!(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d::{withdraw(uint256)() 100} -!> InsufficientBalance(uint256,uint256) [_ $]) >= 100

# The other direction: guard a batch on a view still resolving
assert @bool!(not @reverts!(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d::{decimals()(uint8)}))

# Compose into boolean logic — safe here because every operand is a probe,
# so there is no revert left for the eager `and` to trip over
assert @bool!(@reverts!(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d::{transferFrom(address,address,uint256)(bool) 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d 1000000000000000000000000000000}) and not @reverts!(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d::{symbol()(string)}))
```
