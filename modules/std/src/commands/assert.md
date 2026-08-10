---
title: "assert"
---

Assert that an on-chain expression satisfies a comparison, on-chain.

## Syntax

```evml
assert <call> [operator] [expected] [message] [...extra]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `call` | `expression` | A `::` call expression or on-chain helper, e.g. `@token(WETH)::balanceOf(@me)` or `@num!(@balance!(ETH @me) + 1e18)` |
| `[operator]` | `string` | Comparison operator: ==, !=, >, <, >=, <=, ~= |
| `[expected]` | `expression` | Expected value — a constant, or another live call/on-chain helper |
| `[message]` | `string` | Revert message when the assertion fails |
| `[...extra]` | `any` | (invalid) trailing tokens — infix expressions must be wrapped in @num!/@bool! |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--delta` | `number` | Allowed delta for the ~= (approximate) operator |

<!-- HAND-WRITTEN -->

## Examples

```evml
load lang
load token

# Compare a view return against a value (named method; ABI fetched automatically)
assert @token(WETH)::balanceOf(@me) >= @token:amount(WETH 10) "insufficient bal"

# Inline ABI when the return type must be explicit (no ABI lookup)
assert @token(WETH)::{balanceOf(address)(uint256) @me} >= @token:amount(WETH 10) "insufficient bal"

# int256 returns compare signed
set $oracle 0x0102030405060708090a0b0c0d0e0f1011121314
assert $oracle::{drift()(int256)} <= -5 "drifted"

# Select a tuple element with a destructure lens ($ marks the element)
set $pool 0x44fA8E6f47987339850636F88629646662444217
assert $pool::{getReserves()(uint112,uint112,uint32)}[_ $ _] >= 1000 "low reserve"

# A nested lens navigates the return: each level steps into an array
# (element by position, bounds-checked against the live length on-chain)
# or a struct (field by position) — to any depth
set $safe 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E2
assert $safe::{getOwners()(address[])}[[_ $]] == @me "second owner changed"
assert $safe::{proposals()((address,uint256,bool)[])}[[_ [_ _ $]]] == true
assert @len!($safe::{matrix()(address[][])}[[$]]) >= 3

# Approximate comparison with an allowed delta
assert $oracle::{price()(uint256)} ~= 2000e8 --delta 50e8 "price out of range"

# Bare boolean assertion (asserts the return is true)
set $gov 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1
assert $gov::{paused()(bool)}

# Chain calls: every hop but the last must return an address —
# or select one from a multi-value return with a destructure lens
assert $pool::{token()(address)}::{symbol()(string)} == "WETH"
assert $pool::{poolInfo()(uint112,uint112,address)}[_ _ $]::{symbol()(string)} == "WETH"

# On-chain composition: ! helpers evaluate at assertion time via the
# core read primitive splicing operands into Operators calls
assert @num!(@balance!(ETH @me) + @token(WETH)::balanceOf(@me)) > @token(WETH)::balanceOf(@ens(evmcrispr.eth))
assert @bool!(($gov::{quorum()(uint256)} > 0) or ($gov::{paused()(bool)} == false))
assert @len!($gov::{voters()(address[])}) >= 3 "not enough voters"
assert @str.split!($pool::{name()(string)} " " 1) == "LP"

# Nested live calls as arguments: inner calls resolve at assertion time and
# splice into the enclosing call's calldata (any nesting depth)
set $a 0x0102030405060708090a0b0c0d0e0f1011121315
set $b 0x0102030405060708090a0b0c0d0e0f1011121316
set $c 0x0102030405060708090a0b0c0d0e0f1011121317
set $d 0x0102030405060708090a0b0c0d0e0f1011121318
assert $a::{a(address)(uint256,uint256[]) $b::{b(uint256,uint256)(address) $c::{c(address)(uint256) @me} $d::{d()(uint256)}}}[_ [$]] == 7

# A lens on a nested call argument selects the value to splice — including
# dynamic values (arrays) navigated at runtime
assert $a::{a(address[])(uint256) $b::{b()(address,address[][])}[_ [_ $]]} == 5
```

## Notes

- Each side of the comparison is either **live** (a `::` call expression or a
  `!`-suffixed on-chain helper — read at assertion time) or a **build-time
  constant** (literals, `$vars`, and every ordinary helper such as
  `@token:balance`, which is frozen into calldata when the script builds).
- The command compiles to the ERC-8211 judge: the live expression becomes an
  `InputParam` (a staticcall, balance read, or nested core/operator
  expression) validated by inline constraints (`EQ`/`GTE`/`LTE`/`IN`) via
  `assertParam`. Comparisons the constraints can't express directly (`!=`,
  signed and two-live-side comparisons) route through the core's `read`
  splicing the operands into an Operators comparison, judged `EQ 1`.
- Composition happens inside `@num!(…)` (arithmetic: `+ - * / % ^`, `xor`)
  and `@bool!(…)` (comparisons plus `and`, `or`, `xor`, prefix `not` — the
  same word operators as std's `@bool`). Wrappers nest freely; constant
  subtrees fold at build time. Top-level infix without a wrapper is an error.
- Operators map by return type: `uint`/`int` support `== != > < >= <= ~=`;
  `address`/`bool`/`bytes32`/`string`/`bytes` support `== !=`. Bool `!=`
  folds into the `EQ 0`/`EQ 1` constraint bound.
- `~=` needs `--delta` and a constant side; for two live values use
  `@absDiff!(a b) <= delta`.
- `<head>::!{sig(argTypes)(returnTypes) args}` constructs a whole call at
  assertion time via the core's `read`: the head may be any expression (a
  `::` chain, an on-chain helper, a computed word — e.g.
  `@bytes!($reg::packedPool() ">>" 96)::!{fee()(uint24)}`), and the
  arguments splice like nested live calls. The head must still resolve to
  a clean address word on-chain, and the inline ABI form is mandatory:
  a `::!` hop has no composition-time address to fetch an ABI from.
- The `!` trails the `::` so it never sits against the head. Written the
  other way it would be indistinguishable from the trailing `!` of an
  on-chain helper face: `@name!::{…}` splits as `@name!` before a plain
  hop or as `@name` before a read hop, and nothing in the text says
  which. After the operator there is nothing to collide with, so
  `@me::!{…}` and `@name!::!{…}` both read one way only.
- Nested live calls as call arguments compile to the core's `read`
  primitive: the enclosing call becomes an on-chain-constructed operand
  whose calldata segments (literal spans + live values) the judge
  concatenates at assertion time, so the judged value always flows through
  a plain `assertParam`. Word-typed arguments (uint, int, address, bool,
  bytes32) splice anywhere at any nesting depth. Dynamic-typed arguments
  (array/string/bytes selected by a lens) splice too, up to four per call:
  their envelopes go at the end and each offset after the first is
  computed on-chain from the earlier payloads' lengths. Four is a hard
  limit because each live value is re-resolved by every offset that
  follows it, so the cost grows with the square.
- Inside a `batch`, a failed assertion reverts the whole transaction. Run
  standalone, the assertion is evaluated as a read-only `eth_call`.
- The two contracts an assertion is built against — the ERC-8211 core that
  judges and the Operators periphery that computes — sit at deterministic
  CREATE2 addresses, identical on every chain, so there is nothing to
  configure. A fork that wants different code there installs it at those
  addresses, which keeps the compiled calldata unchanged.

## See Also

- `@num!`, `@bool!`
- `@balance!`, `@len!`, `@str.split!`
