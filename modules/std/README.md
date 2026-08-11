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
| [assert](src/commands/assert.md) | Assert that an on-chain expression satisfies a comparison, on-chain. |
| [batch](src/commands/batch.md) | Group multiple commands into a single transaction. |
| [def](src/commands/def.md) | Define a user command, helper, on-chain helper (`def @name!`), or module (`def module <name> ( ...defs )`), or return early from a command body (`def return`). |
| [exec](src/commands/exec.md) | Call a contract function, encoding the arguments from its signature. |
| [exit](src/commands/exit.md) | Stop script execution immediately. |
| [if](src/commands/if.md) | Conditionally execute a block of commands, with an optional else block. |
| [load](src/commands/load.md) | Load a module. Its commands and helpers become available qualified (`mod:cmd`, `@mod:helper`); an import list makes selected names available unqualified. |
| [loop](src/commands/loop.md) | Repeat a block: iterate over an array (`loop $x of $arr`), repeat until a condition is true (`loop until <condition>`), or exit/skip an iteration from inside the block (`loop break`, `loop continue`). |
| [print](src/commands/print.md) | Log values to the console output. Arrays render as headerless tables: a flat array as one row, an array of arrays as one row per inner array. |
| [send](src/commands/send.md) | Send a low-level transaction. Provide [to] for a call/transfer, --data for raw calldata, --value for native value, or any combination. |
| [set](src/commands/set.md) | Assign a value to a variable for use later in the script. |
| [sign](src/commands/sign.md) | Sign a message or typed data with the connected wallet. |
| [switch](src/commands/switch.md) | Switch the active chain by name or ID. |
| [wait](src/commands/wait.md) | Wait for a duration before executing the next action (fork simulations advance the chain's clock instead). |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@abi.decode](src/helpers/abi.decode.md) | `any` | Decode ABI-encoded bytes into values given a comma-separated type list; a lens selects one of them. |
| [@abi.decodeCall](src/helpers/abi.decodeCall.md) | `array` | Decode calldata into `[contract signature [args]]` with human-readable EVML values. |
| [@abi.encode](src/helpers/abi.encode.md) | `bytes` | ABI-encode values given a comma-separated type list, like Solidity abi.encode. |
| [@abi.encodeCall](src/helpers/abi.encodeCall.md) | `bytes` | ABI-encode a function call from its signature and arguments. |
| [@abi.encodePacked](src/helpers/abi.encodePacked.md) | `bytes` | ABI non-standard packed encoding, matching Solidity's abi.encodePacked. |
| [@arr](src/helpers/arr.md) | `array` | Generate an array of sequential integers from start (inclusive) to end (exclusive). |
| [@balance](src/helpers/balance.md) | `number` | Balance in base units: the native balance for ETH, or an ERC-20 balanceOf for any token symbol or address. |
| [@block](src/helpers/block.md) | `array` | [number, timestamp] of the latest or a specific block. |
| [@bool](src/helpers/bool.md) | `bool` | Evaluate a boolean expression or convert a value to a boolean string. |
| [@bytes](src/helpers/bytes.md) | `bytes` | Convert a value to hex bytes, force UTF-8 encoding, or perform a bitwise operation. |
| [@bytes32](src/helpers/bytes32.md) | `bytes32` | Pad a value to a 32-byte hex string. Integers and arithmetic expressions are left-padded like Solidity's `bytes32(uint256(...))` cast; hex strings pad left by default or right with a trailing `right`. |
| [@date](src/helpers/date.md) | `number` | Parse a date string into a Unix timestamp, with an optional offset. |
| [@ens](src/helpers/ens.md) | `address` | Resolve an ENS name to its address. |
| [@gas.estimate](src/helpers/gas.estimate.md) | `number` | Estimate the gas required for a contract call. |
| [@gas.price](src/helpers/gas.price.md) | `number` | Current gas price in wei. |
| [@get](src/helpers/get.md) | `any` | Call a read-only contract function and return its result. |
| [@hash](src/helpers/hash.md) | `bytes32` | Compute the hash of a string with keccak256 (default) or sha256. |
| [@ifElse](src/helpers/ifElse.md) | `any` | A ternary over live reads: `cond ? then : else`, evaluating only the winning branch. Parenthesized ternaries nest as branches. |
| [@ipfs](src/helpers/ipfs.md) | `string` | Upload text content to IPFS and return the CID. |
| [@ipfs.get](src/helpers/ipfs.get.md) | `string` | Fetch content from IPFS, verified against its CID, and return it as text. |
| [@me](src/helpers/me.md) | `address` | Connected wallet address. |
| [@nonce](src/helpers/nonce.md) | `number` | Number of transactions sent from an address (its account nonce), read over plain RPC. For contracts it counts the CREATEs they performed. There is no on-chain form: the EVM has no nonce opcode. |
| [@num](src/helpers/num.md) | `number` | Evaluate an arithmetic expression or convert a value to a number. |
| [@orElse](src/helpers/orElse.md) | `any` | The value of the first read, or the second one when the first reverts. |
| [@reverts](src/helpers/reverts.md) | `any` | Whether a live call reverts: true when the chain refuses the call, false when it resolves; `-!>` matches the reason and a lens selects an error argument. |
| [@sigValid](src/helpers/sigValid.md) | `bool` | Verify a signature against an expected signer address. Auto-detects EIP-712 typed data (JSON) vs. plain message. |
| [@str](src/helpers/str.md) | `string` | Convert a value to its string representation, or decode hex bytes as UTF-8. |
| [@Ether](src/helpers/token.md) | `address` | Resolve a token symbol to its contract address on the current chain. |

