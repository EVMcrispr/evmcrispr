# std module

The standard module is loaded by default. It provides core language constructs, contract interaction, control flow, and data manipulation.

## Commands

| Command | Description |
|---------|-------------|
| [batch](src/commands/batch.md) | Group multiple commands into a single transaction. |
| [def](src/commands/def.md) | Define a user command or helper. |
| [exec](src/commands/exec.md) | Call a contract function, encoding the arguments from its signature. |
| [for](src/commands/for.md) | Iterate over an array, executing a block for each element. |
| [halt](src/commands/halt.md) | Stop script execution immediately. |
| [if](src/commands/if.md) | Conditionally execute a block of commands, with an optional else block. |
| [load](src/commands/load.md) | Load a module to make its commands and helpers available. |
| [print](src/commands/print.md) | Log values to the console output. |
| [raw](src/commands/raw.md) | Send a raw transaction with pre-encoded calldata. |
| [set](src/commands/set.md) | Assign a value to a variable for use later in the script. |
| [sign](src/commands/sign.md) | Sign a message or typed data with the connected wallet. |
| [switch](src/commands/switch.md) | Switch the active chain by name or ID. |
| [while](src/commands/while.md) | Repeat a block while a condition is true. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@abi.encodeCall](src/helpers/abi.encodeCall.md) | `bytes` | ABI-encode a function call from its signature and arguments. |
| [@all](src/helpers/all.md) | `bool` | Return true if every element satisfies the predicate. |
| [@any](src/helpers/any.md) | `bool` | Return true if at least one element satisfies the predicate. |
| [@at](src/helpers/at.md) | `any` | Access an element by index in an array. |
| [@bool](src/helpers/bool.md) | `bool` | Evaluate a boolean expression or convert a value to a boolean string. |
| [@bytes](src/helpers/bytes.md) | `bytes` | Convert a value to hex bytes, force UTF-8 encoding, or perform a bitwise operation. |
| [@bytes.at](src/helpers/bytes.at.md) | `bytes` | Access a single byte by index in a bytes value. |
| [@bytes.concat](src/helpers/bytes.concat.md) | `bytes` | Concatenate bytes values together. |
| [@bytes.len](src/helpers/bytes.len.md) | `number` | Return the byte length of a bytes value. |
| [@bytes.not](src/helpers/bytes.not.md) | `bytes` | Bitwise NOT of a bytes value (256-bit complement). |
| [@bytes.slice](src/helpers/bytes.slice.md) | `bytes` | Extract a byte range from a bytes value. |
| [@concat](src/helpers/concat.md) | `array` | Concatenate arrays together. |
| [@contract.codeAt](src/helpers/contract.codeAt.md) | `bytes` | Return the deployed bytecode at an address. |
| [@contract.next](src/helpers/contract.next.md) | `address` | Predict the next contract address deployed by a given account. |
| [@contract.storageAt](src/helpers/contract.storageAt.md) | `bytes32` | Read a raw storage slot of a contract. |
| [@date](src/helpers/date.md) | `number` | Parse a date string into a Unix timestamp, with an optional offset. |
| [@ens](src/helpers/ens.md) | `address` | Resolve an ENS name to its address. |
| [@enumerate](src/helpers/enumerate.md) | `array` | Return an array of [index, element] pairs. |
| [@filter](src/helpers/filter.md) | `array` | Keep elements of an array for which a helper returns truthy. |
| [@find](src/helpers/find.md) | `any` | Return the first element that satisfies the predicate. |
| [@flat](src/helpers/flat.md) | `array` | Flatten one level of nesting in an array. |
| [@get](src/helpers/get.md) | `any` | Call a read-only contract function and return its result. |
| [@id](src/helpers/id.md) | `bytes32` | Compute the keccak256 hash of a string (first 4 bytes for selectors). |
| [@includes](src/helpers/includes.md) | `bool` | Check whether an array contains an element. |
| [@ipfs](src/helpers/ipfs.md) | `string` | Upload text content to IPFS and return the CID. |
| [@len](src/helpers/len.md) | `number` | Return the length of an array. |
| [@map](src/helpers/map.md) | `array` | Transform each element of an array by applying a helper. |
| [@me](src/helpers/me.md) | `address` | Return the connected wallet address. |
| [@namehash](src/helpers/namehash.md) | `bytes32` | Compute the ENS namehash of a domain name. |
| [@num](src/helpers/num.md) | `number` | Evaluate an arithmetic expression or convert a value to a number. |
| [@num.format](src/helpers/num.format.md) | `string` | Format a number with decimal places (like formatUnits). |
| [@num.parse](src/helpers/num.parse.md) | `number` | Parse a decimal string with a given number of decimals (like parseUnits). |
| [@range](src/helpers/range.md) | `array` | Generate an array of sequential integers from start (inclusive) to end (exclusive). |
| [@reduce](src/helpers/reduce.md) | `any` | Reduce an array to a single value by applying a helper. |
| [@reverse](src/helpers/reverse.md) | `array` | Return a new array with elements in reverse order. |
| [@slice](src/helpers/slice.md) | `array` | Extract a section of an array. |
| [@sort](src/helpers/sort.md) | `array` | Sort an array using a comparator helper. |
| [@str](src/helpers/str.md) | `string` | Convert a value to its string representation. |
| [@str.at](src/helpers/str.at.md) | `string` | Access a character by index in a string. |
| [@str.concat](src/helpers/str.concat.md) | `string` | Concatenate strings together. |
| [@str.includes](src/helpers/str.includes.md) | `bool` | Check whether a string contains a substring. |
| [@str.join](src/helpers/str.join.md) | `string` | Join array elements into a string with a delimiter. |
| [@str.len](src/helpers/str.len.md) | `number` | Return the length of a string. |
| [@str.lower](src/helpers/str.lower.md) | `string` | Convert a string to lowercase. |
| [@str.replace](src/helpers/str.replace.md) | `string` | Replace all occurrences of a substring. |
| [@str.slice](src/helpers/str.slice.md) | `string` | Extract a section of a string. |
| [@str.split](src/helpers/str.split.md) | `array` | Split a string by a delimiter into an array of strings. |
| [@str.upper](src/helpers/str.upper.md) | `string` | Convert a string to uppercase. |
| [@token](src/helpers/token.md) | `address` | Resolve a token symbol to its contract address on the current chain. |
| [@token.amount](src/helpers/token.amount.md) | `number` | Convert a human-readable token amount to its base unit (applying decimals). |
| [@token.balance](src/helpers/token.balance.md) | `number` | Fetch the token balance of an address in base units. |
| [@unique](src/helpers/unique.md) | `array` | Remove duplicates from an array, preserving first-occurrence order. |
| [@unzip](src/helpers/unzip.md) | `array` | Transpose an array of pairs into two separate arrays. |
| [@zip](src/helpers/zip.md) | `array` | Combine two arrays element-wise into an array of pairs. |

