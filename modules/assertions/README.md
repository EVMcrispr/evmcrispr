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
| [@assertions:not!](src/helpers/not.md) | `any` | Negation dispatched on the operand: logical not for a boolean (stays a bool), bitwise complement of the raw word for a number or bytes32. Never a conversion: cast with `@bytes!(x)` first. |
| [@assertions:ok!](src/helpers/ok.md) | `bool` | Whether a live call resolves without reverting: true when the call succeeds, false when it reverts. |

