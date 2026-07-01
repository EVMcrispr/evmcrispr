---
title: "assert"
---

Assert that a contract view return satisfies a comparison, on-chain.

## Syntax

```evml
assert <call> [operator] [expected] [message]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `call` | `expression` | A `::` call expression, e.g. `@token(WETH)::balanceOf(@me)` |
| `[operator]` | `string` | Comparison operator: ==, !=, >, <, >=, <=, ~= |
| `[expected]` | `any` | Expected value the return is compared against |
| `[message]` | `string` | Revert message when the assertion fails |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--delta` | `number` | Allowed delta for the ~= (approximate) operator |

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

# Compare a view return against a value (named method; ABI fetched automatically)
assertions:assert @token(WETH)::balanceOf(@me) >= @token.amount(WETH 10) "insufficient bal"

# Inline ABI when the return type must be explicit (no ABI lookup)
assertions:assert @token(WETH)::{balanceOf(address)(uint256) @me} >= @token.amount(WETH 10) "insufficient bal"

# Select a tuple element with a destructure lens ($ marks the element)
assertions:assert @pool::{getReserves()(uint112,uint112,uint32)}[_ $ _] >= 1000 "low reserve"

# Approximate comparison with an allowed delta
assertions:assert @oracle::{price()(uint256)} ~= 2000e8 --delta 50e8 "price out of range"

# Bare boolean assertion (asserts the return is true)
assertions:assert @gov::{paused()(bool)}
```

## Notes

- The first argument must be a `::` call expression so the (contract, calldata,
  return type) can be captured without being evaluated off-chain.
- Inside a `batch`, a failed assertion reverts the whole transaction. Run
  standalone, the assertion is evaluated as a read-only `eth_call`.
- Operators map to the contract functions by return type: `uint` supports
  `== != > < >= <= ~=`; `address`/`bool`/`bytes32` support `== !=`.
- Set `$assertions.address` to override the resolved contract (forks / testing).

## See Also
