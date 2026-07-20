# std module

The standard module is loaded by default. It provides core language constructs, contract interaction, control flow, and data manipulation.

## Configuration variables

Config variables are set with `set` (fully qualified, including the module prefix) and are only readable by their own module and the user script.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `$std:tokenlist` | `string` | `https://api.evmcrispr.com/tokenlist/{chainId}` | Tokenlist URL used to resolve token symbols (must be HTTPS). |
| `$std:ipfsJwt` | `string` | — | Pinata JWT used by @ipfs to upload content. |

## Commands

| Command | Description |
|---------|-------------|
| [batch](src/commands/batch.md) | Group multiple commands into a single transaction. |
| [def](src/commands/def.md) | Define a user command, helper, or module (`def module <name> ( ...defs )`). |
| [exec](src/commands/exec.md) | Call a contract function, encoding the arguments from its signature. |
| [halt](src/commands/halt.md) | Stop script execution immediately. |
| [if](src/commands/if.md) | Conditionally execute a block of commands, with an optional else block. |
| [load](src/commands/load.md) | Load a module. Its commands and helpers become available qualified (`mod:cmd`, `@mod:helper`); an import list makes selected names available unqualified. |
| [loop](src/commands/loop.md) | Repeat a block: iterate over an array (`loop $x of $arr`) or until a condition is true (`loop until <condition>`). |
| [print](src/commands/print.md) | Log values to the console output. Arrays render as headerless tables: a flat array as one row, an array of arrays as one row per inner array. |
| [send](src/commands/send.md) | Send a low-level transaction. Provide [to] for a call/transfer, --data for raw calldata, --value for native value, or any combination. |
| [set](src/commands/set.md) | Assign a value to a variable for use later in the script. |
| [sign](src/commands/sign.md) | Sign a message or typed data with the connected wallet. |
| [switch](src/commands/switch.md) | Switch the active chain by name or ID. |
| [wait](src/commands/wait.md) | Wait for a duration before executing the next action (fork simulations advance the chain's clock instead). |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@abi.decode](src/helpers/abi.decode.md) | `array` | Decode ABI-encoded bytes into values given a comma-separated type list. |
| [@abi.decodeCall](src/helpers/abi.decodeCall.md) | `array` | Decode calldata into `[contract signature [args]]` with human-readable EVML values. |
| [@abi.encode](src/helpers/abi.encode.md) | `bytes` | ABI-encode values given a comma-separated type list, like Solidity abi.encode. |
| [@abi.encodeCall](src/helpers/abi.encodeCall.md) | `bytes` | ABI-encode a function call from its signature and arguments. |
| [@abi.encodePacked](src/helpers/abi.encodePacked.md) | `bytes` | ABI non-standard packed encoding, matching Solidity's abi.encodePacked. |
| [@arr](src/helpers/arr.md) | `array` | Generate an array of sequential integers from start (inclusive) to end (exclusive). |
| [@block](src/helpers/block.md) | `any` | Return [number, timestamp] of the latest or a specific block. |
| [@bool](src/helpers/bool.md) | `bool` | Evaluate a boolean expression or convert a value to a boolean string. |
| [@bytes](src/helpers/bytes.md) | `bytes` | Convert a value to hex bytes, force UTF-8 encoding, or perform a bitwise operation. |
| [@date](src/helpers/date.md) | `number` | Parse a date string into a Unix timestamp, with an optional offset. |
| [@ens](src/helpers/ens.md) | `address` | Resolve an ENS name to its address. |
| [@gas.estimate](src/helpers/gas.estimate.md) | `number` | Estimate the gas required for a contract call. |
| [@gas.price](src/helpers/gas.price.md) | `number` | Return the current gas price in wei. |
| [@get](src/helpers/get.md) | `any` | Call a read-only contract function and return its result. |
| [@id](src/helpers/id.md) | `bytes32` | Compute the keccak256 hash of a string (first 4 bytes for selectors). |
| [@ipfs](src/helpers/ipfs.md) | `string` | Upload text content to IPFS and return the CID. |
| [@ipfs.get](src/helpers/ipfs.get.md) | `any` | Fetch content from IPFS and return it as text. |
| [@me](src/helpers/me.md) | `address` | Return the connected wallet address. |
| [@nonce](src/helpers/nonce.md) | `number` | Get the transaction count (nonce) of an address. |
| [@num](src/helpers/num.md) | `number` | Evaluate an arithmetic expression or convert a value to a number. |
| [@sigValid](src/helpers/sigValid.md) | `bool` | Verify a signature against an expected signer address. Auto-detects EIP-712 typed data (JSON) vs. plain message. |
| [@str](src/helpers/str.md) | `string` | Convert a value to its string representation, or decode hex bytes as UTF-8. |
| [@token](src/helpers/token.md) | `address` | Resolve a token symbol to its contract address on the current chain. |
| [@token.allowance](src/helpers/token.allowance.md) | `number` | Fetch the allowance an owner has granted to a spender, in base units. |
| [@token.amount](src/helpers/token.amount.md) | `number` | Convert a human-readable token amount to its base unit (applying decimals). |
| [@token.balance](src/helpers/token.balance.md) | `number` | Fetch the token balance of an address in base units. |
| [@token.decimals](src/helpers/token.decimals.md) | `number` | Return the number of decimals of a token. |
| [@token.format](src/helpers/token.format.md) | `string` | Format a base-unit token amount as a human-readable string with the token symbol. |
| [@token.symbol](src/helpers/token.symbol.md) | `string` | Return the symbol of a token. |
| [@token.totalSupply](src/helpers/token.totalSupply.md) | `number` | Fetch the total supply of a token in base units. |

