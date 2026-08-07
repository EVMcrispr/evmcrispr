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
| [@assertions:absdiff!](src/helpers/absdiff-bang.md) | `number` | Absolute difference |a - b| computed on-chain — never underflows; `@absdiff!(a b) <= d` is the composable approximate-equality. |
| [@assertions:at!](src/helpers/at-bang.md) | `number` | Extract a raw 32-byte word from the return data of a call by word index, on-chain. Raw layout, not decoded — for dynamic-array elements use a nested lens like [[_ $]] instead. A negative index counts from the end (-1 = last word). |
| [@assertions:balance!](src/helpers/balance-bang.md) | `number` | Read a balance on-chain at assertion time: the native balance for ETH, or an ERC-20 balanceOf for any token symbol or address. |
| [@assertions:blocknumber!](src/helpers/blocknumber-bang.md) | `number` | The block number at assertion time (not at script build time). |
| [@assertions:bool!](src/helpers/bool-bang.md) | `bool` | Compose live comparisons with on-chain logic (and, or, xor, not), evaluated at assertion time via the combinators contract. |
| [@assertions:bytelen!](src/helpers/bytelen-bang.md) | `number` | The raw byte length of the return data of a call, on-chain (a uint256[] with n items is 64 + n*32 bytes). |
| [@assertions:bytes!](src/helpers/bytes-bang.md) | `number` | Bitwise word operations computed on-chain (`&` `|` `^` `<<` `>>`), or with a single argument the raw 32-byte word cast (e.g. bool as 0/1). Word-width semantics: operands are the raw 32-byte words; shifts are in bits. |
| [@assertions:chainid!](src/helpers/chainid-bang.md) | `number` | The chain id at assertion time, read on-chain — unlike assert-chainid it composes into expressions. |
| [@assertions:charset!](src/helpers/charset-bang.md) | `bool` | Whether every byte of the string return of a call is in a character class, checked on-chain — only-lowercase is @charset!(call `a-z`). |
| [@assertions:codehash](src/helpers/codehash.md) | `bytes32` | Read the code hash of an address at script build time, with EXTCODEHASH semantics: `bytes32(0)` for a nonexistent account (zero nonce, balance and code), `keccak256` of the code otherwise. Matches what @codehash! reads on-chain at assertion time. |
| [@assertions:codehash!](src/helpers/codehash-bang.md) | `bytes32` | The EXTCODEHASH of an account, read on-chain at assertion time: `bytes32(0)` for a nonexistent account, `keccak256` of the code otherwise. The account can be a `::` call resolving to an address, such as a proxy implementation. |
| [@assertions:hash!](src/helpers/hash-bang.md) | `bytes32` | keccak256 of the raw return data of a call, computed on-chain — compare structs, arrays or long strings against a precomputed hash. |
| [@assertions:includes!](src/helpers/includes-bang.md) | `bool` | Whether the string return of a call contains a substring, checked on-chain — exact byte sequence, case-sensitive, no wildcards. |
| [@assertions:len!](src/helpers/len-bang.md) | `number` | The decoded length of the dynamic return value of a call, on-chain: element count for arrays, byte length for string/bytes. |
| [@assertions:max!](src/helpers/max-bang.md) | `number` | Maximum of two or more values, computed on-chain at assertion time. |
| [@assertions:min!](src/helpers/min-bang.md) | `number` | Minimum of two or more values, computed on-chain at assertion time. |
| [@assertions:not!](src/helpers/not-bang.md) | `any` | Negation computed on-chain, dispatched on the operand: logical not for booleans (stays a bool), bitwise complement of the raw 32-byte word for numbers and bytes32. Never a conversion — cast explicitly with @bytes!(x) first if needed. |
| [@assertions:num!](src/helpers/num-bang.md) | `number` | Compose live calls and constants with on-chain arithmetic (+ - * / % ^, xor), evaluated at assertion time via the combinators contract. |
| [@assertions:split!](src/helpers/split-bang.md) | `string` | Split the string return of a call on a delimiter and select one segment, on-chain. A negative index counts from the end (-1 = last segment). |
| [@assertions:timestamp!](src/helpers/timestamp-bang.md) | `number` | The block timestamp at assertion time (not at script build time). |

