# assertions module

On-chain assertions backed by the assertions.eth contract: verify view return values and chain state atomically. Requires `load assertions`.

```evml
load assertions
```

## Commands

| Command | Description |
|---------|-------------|
| [assert](src/commands/assert.md) | Assert that a contract view return satisfies a comparison, on-chain. |
| [assert-balance](src/commands/assert-balance.md) | Assert the native balance of an account, on-chain. |
| [assert-block-number](src/commands/assert-block-number.md) | Assert the current block number, on-chain. |
| [assert-chainid](src/commands/assert-chainid.md) | Assert the chain ID equals an expected value, on-chain. |
| [assert-code](src/commands/assert-code.md) | Assert an address has deployed code, on-chain. |
| [assert-codehash](src/commands/assert-codehash.md) | Assert an address has a specific code hash, on-chain. |
| [assert-no-code](src/commands/assert-no-code.md) | Assert an address has no deployed code, on-chain. |
| [assert-timestamp](src/commands/assert-timestamp.md) | Assert the current block timestamp, on-chain. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@codehash](src/helpers/codehash.md) | `bytes32` | Read the keccak256 code hash of an address. |

