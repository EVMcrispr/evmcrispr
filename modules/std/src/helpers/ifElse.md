---
title: "@ifElse"
---

A ternary over live reads: `cond ? then : else`, evaluating only the winning branch. Parenthesized ternaries nest as branches.

**On-chain (`@ifElse!`)**: Compiles to the core's lazy `cond`: the condition's first resolved word judges (nonzero = then) and the losing branch is never resolved.

**Returns**: `any`

## Syntax

```evml
@ifElse(...expression)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[...expression]` | `any` | `cond ? then : else` — a bool-expression condition, then two branches: values, expressions, or parenthesized nested ternaries |

## Examples

```evml
# Branch on a live read at build time
set $fee @ifElse(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d::{decimals()(uint8)} == 18 ? 100 : 200)
print $fee
```

<!-- HAND-WRITTEN -->

## Notes

- The `?` and `:` need SPACES around them: `$a:$b` glues into a single
  token and the ternary shape is never seen.
- The condition is everything before the `?` — a full boolean expression
  (`$x > 5 and $paused`) or a single value judged by truthiness. On-chain
  that truthiness is the core's: the FIRST RESOLVED WORD, nonzero = then.
- Branches are values (`::` calls, `!` helpers, variables, literals),
  expressions (`$v + 8`, `$a and $b`), or PARENTHESIZED nested ternaries:
  `$a ? ($b ? $c and $e : $d) : $f`. An unparenthesized nested `?` is
  ambiguous and rejected.
- Only the winning branch is evaluated, on both faces — recursively, so a
  nested ternary's losing read never runs either. The loser may be a read
  that reverts; that is often the point of branching.
- A build-time constant condition folds: the helper returns the winning
  branch directly, and on `!` the losing branch is not even compiled.

## See Also

- [@orElse](orElse.md) — branch on FAILURE where @ifElse branches on a
  value; [@reverts](reverts.md); the [if command](../commands/if.md) for
  branching between whole command blocks; the
  [cond primitive](https://evm-crispr.blossom.software/docs/core/control)
  this compiles to.

## On-chain face (@ifElse!)

Compiles to the core's `cond(c, then, else)` — the lazy conditional. The
condition operand resolves normally (constraints included: a violated
condition constraint fails the whole assertion); its first word judges,
nonzero selecting the then-branch; and ONLY the winner is resolved, so the
loser's calls never happen at judge time.

- Branches must resolve to the same kind of value — the judge compares
  whichever one wins. Signed and unsigned words are the one compatible
  pair.
- Constant branches ride as raw words, so string/bytes CONSTANTS are
  rejected; live string/bytes reads are fine (the winner's canonical
  envelope passes through byte-identically).
- Branches carrying different scales are rejected — a ray then-branch and
  a wad else-branch would judge as different numbers depending on the
  condition.
- Branching on a call resolving at all is `@ifElse!(@bool!(not
  @reverts!(…)) ? a : b)`; branching on failure with a fallback VALUE is
  just [@orElse!](orElse.md).

### Usage

```evml
# Judge against a threshold that depends on live state
assert 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d::{balanceOf(address)(uint256) 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045} >= @ifElse!(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d::{decimals()(uint8)} == 18 ? 1e18 : 1e6)

# The losing branch never resolves — guard a read behind a live switch
assert @ifElse!(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d::{decimals()(uint8)} > 6 ? 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d::{totalSupply()(uint256)} : 0) >= 0
```
