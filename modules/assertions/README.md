# assertions module

On-chain assertions backed by the assertions.eth contract: verify view return values and chain state atomically. Requires `load assertions`.

```evml
load assertions
```

## Configuration variables

Config variables are set with `set` (fully qualified, including the module prefix) and are only readable by their own module and the user script.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `$assertions:address` | `address` | — | Override the resolved assertions contract address (forks / testing). |
| `$assertions:operators` | `address` | — | Override the resolved operators contract address (forks / testing). |

## Commands

| Command | Description |
|---------|-------------|
| [assertions:assert](src/commands/assert.md) | Assert that an on-chain expression satisfies a comparison, on-chain. |
| [assertions:assert-balance](src/commands/assert-balance.md) | Assert the native balance of an account, on-chain. |
| [assertions:assert-block-number](src/commands/assert-block-number.md) | Assert the current block number, on-chain. |
| [assertions:assert-chainid](src/commands/assert-chainid.md) | Assert the chain ID equals an expected value, on-chain. |
| [assertions:assert-code](src/commands/assert-code.md) | Assert an address has deployed code, on-chain. |
| [assertions:assert-codehash](src/commands/assert-codehash.md) | Assert an address has a specific code hash, on-chain. |
| [assertions:assert-no-code](src/commands/assert-no-code.md) | Assert an address has no deployed code, on-chain. |
| [assertions:assert-timestamp](src/commands/assert-timestamp.md) | Assert the current block timestamp, on-chain. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@assertions:absdiff!](src/helpers/absdiff.md) | `number` | Absolute difference |a - b| computed on-chain — never underflows; `@absdiff!(a b) <= d` is the composable approximate-equality. |
| [@assertions:chainid](src/helpers/chainid.md) | `number` | The chain id: read at script build time as @chainid, on-chain at assertion time as @chainid! — unlike assert-chainid both compose into expressions. |
| [@assertions:codehash](src/helpers/codehash.md) | `bytes32` | Read the code hash of an address with EXTCODEHASH semantics: `bytes32(0)` for a nonexistent account (zero nonce, balance and code), `keccak256` of the code otherwise. Plain @codehash reads at script build time; @codehash! reads on-chain at assertion time, and its account can be a `::` call resolving to an address, such as a proxy implementation. |
| [@assertions:max!](src/helpers/max.md) | `number` | Maximum of two or more values, computed on-chain at assertion time. |
| [@assertions:min!](src/helpers/min.md) | `number` | Minimum of two or more values, computed on-chain at assertion time. |
| [@assertions:not!](src/helpers/not.md) | `any` | Negation computed on-chain, dispatched on the operand: logical not for booleans (stays a bool), bitwise complement of the raw 32-byte word for numbers and bytes32. Never a conversion — cast explicitly with @bytes!(x) first if needed. |
| [@assertions:ok!](src/helpers/ok.md) | `bool` | Whether a live call resolves without reverting, checked on-chain at assertion time: true when the call succeeds, false when it reverts. |
| [@assertions:sqrt!](src/helpers/sqrt.md) | `number` | Integer square root (floor) computed on-chain, the AMM invariant form, e.g. @sqrt!($pool::reserve0() * $pool::reserve1()). |

