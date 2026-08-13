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

## Commands

| Command | Description |
|---------|-------------|
| [assertions:assert](src/commands/assert.md) | Assert that a contract view return satisfies a comparison, on-chain. |
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
| [@assertions:codehash](src/helpers/codehash.md) | `bytes32` | Read the code hash of an address at script build time, with EXTCODEHASH semantics: `bytes32(0)` for a nonexistent account (zero nonce, balance and code), `keccak256` of the code otherwise. |

