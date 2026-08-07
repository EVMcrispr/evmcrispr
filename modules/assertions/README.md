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
| `$assertions:combinators` | `address` | — | Override the resolved combinators contract address (forks / testing). |

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
| [@assertions:at!](src/helpers/at.md) | `number` | Extract a raw 32-byte word from the return data of a call by word index, on-chain. Raw layout, not decoded — for dynamic-array elements use a nested lens like [[_ $]] instead. A negative index counts from the end (-1 = last word). |
| [@assertions:balance!](src/helpers/balance.md) | `number` | Read a balance on-chain at assertion time: the native balance for ETH, or an ERC-20 balanceOf for any token symbol or address. |
| [@assertions:blocknumber!](src/helpers/blocknumber.md) | `number` | The block number at assertion time (not at script build time). |
| [@assertions:bool!](src/helpers/bool.md) | `bool` | Compose live comparisons with on-chain logic (and, or, xor, not), evaluated at assertion time via the combinators contract. |
| [@assertions:bytelen!](src/helpers/bytelen.md) | `number` | The raw byte length of the return data of a call, on-chain (a uint256[] with n items is 64 + n*32 bytes). |
| [@assertions:charset!](src/helpers/charset.md) | `bool` | Whether every byte of the string return of a call is in a character class, checked on-chain — only-lowercase is @charset!(call `a-z`). |
| [@assertions:codehash](src/helpers/codehash.md) | `bytes32` | Read the keccak256 code hash of an address. |
| [@assertions:hash!](src/helpers/hash.md) | `bytes32` | keccak256 of the raw return data of a call, computed on-chain — compare structs, arrays or long strings against a precomputed hash. |
| [@assertions:includes!](src/helpers/includes.md) | `bool` | Whether the string return of a call contains a substring, checked on-chain — exact byte sequence, case-sensitive, no wildcards. |
| [@assertions:len!](src/helpers/len.md) | `number` | The decoded length of the dynamic return value of a call, on-chain: element count for arrays, byte length for string/bytes. |
| [@assertions:max!](src/helpers/max.md) | `number` | Maximum of two or more values, computed on-chain at assertion time. |
| [@assertions:min!](src/helpers/min.md) | `number` | Minimum of two or more values, computed on-chain at assertion time. |
| [@assertions:num!](src/helpers/num.md) | `number` | Compose live calls and constants with on-chain arithmetic (+ - * / % ^, xor), evaluated at assertion time via the combinators contract. |
| [@assertions:split!](src/helpers/split.md) | `string` | Split the string return of a call on a delimiter and select one segment, on-chain. A negative index counts from the end (-1 = last segment). |
| [@assertions:timestamp!](src/helpers/timestamp.md) | `number` | The block timestamp at assertion time (not at script build time). |

