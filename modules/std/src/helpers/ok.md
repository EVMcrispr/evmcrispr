---
title: "@ok"
---

Whether a live call resolves without reverting: true when the call succeeds, false when it reverts.

**Returns**: `bool`

## Syntax

```evml
@ok(call)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `call` | `address` | A `::` call expression (or chain, or on-chain helper) to probe |

## Examples

```evml
# Probe whether a view call resolves, at build time
set $supported @ok(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d::{decimals()(uint8)})
print $supported
```

<!-- HAND-WRITTEN -->

## Notes

- The argument must be a live call (or on-chain helper) — a constant
  cannot fail, so passing one is an error rather than a vacuous `true`.
- Only the CHAIN refusing the read answers `false`: a revert, or a call
  into an address with no code. A missing ABI, an unknown variable or an
  unreachable node still throw, because those are the script or the setup
  being wrong, and reporting them as a revert would turn a typo into a
  measurement.
- The argument is not resolved before the helper runs — the resolution
  failing is the answer, so `@ok` receives the expression unevaluated.

## See Also

- [assert](../commands/assert.md), [@orElse](orElse.md), [@contracts:codeAt!](../../../contracts/src/helpers/codeAt.md)

## On-chain face (@ok!)

Compiles to the core's `ok(param)` primitive: 1 when the wrapped
expression resolves at assertion time, 0 when anything inside it reverts.

The faces answer the same question at different moments, which is the whole
point of having both: `@ok` says whether the call works NOW, while the
script is being built, and is the one to branch on with `if`; `@ok!` says
whether it works when the batch executes, and is the one to assert on. A
contract that gets paused, self-destructed or upgraded between the two
makes them disagree, and that gap is usually the thing worth asserting.

### Usage

```evml
# Guard a batch on a view still resolving at execution time
assert @ok(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d::{decimals()(uint8)})

# Compose into boolean logic
assert @bool!(@ok!(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d::{decimals()(uint8)}) and 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d::{decimals()(uint8)} <= 18)
```
