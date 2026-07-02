# std module

The standard module is loaded by default. It provides core language constructs, contract interaction, control flow, and data manipulation.

## Commands

| Command | Description |
|---------|-------------|
| [batch](src/commands/batch.md) | Group multiple commands into a single transaction. |
| [def](src/commands/def.md) | Define a user command or helper. |
| [deploy](src/commands/deploy.md) | Deploy a contract from raw creation bytecode. Binds the predicted address to <variable>. Mirror an existing deployment with --mirror-chain / --mirror-address (fetches the original creation bytecode from Etherscan). |
| [exec](src/commands/exec.md) | Call a contract function, encoding the arguments from its signature. |
| [halt](src/commands/halt.md) | Stop script execution immediately. |
| [if](src/commands/if.md) | Conditionally execute a block of commands, with an optional else block. |
| [load](src/commands/load.md) | Load a module to make its commands and helpers available. |
| [loop](src/commands/loop.md) | Repeat a block: iterate over an array (`loop $x of $arr`) or until a condition is true (`loop until <condition>`). |
| [print](src/commands/print.md) | Log values to the console output. |
| [send](src/commands/send.md) | Send a low-level transaction. Provide [to] for a call/transfer, --data for raw calldata, --value for native value, or any combination. |
| [set](src/commands/set.md) | Assign a value to a variable for use later in the script. |
| [sign](src/commands/sign.md) | Sign a message or typed data with the connected wallet. |
| [switch](src/commands/switch.md) | Switch the active chain by name or ID. |
| [verify](src/commands/verify.md) | Submit Solidity Standard JSON Input source code to Etherscan V2 for verification at <address>. Mirror an existing verification with --mirror-chain / --mirror-address, or supply source explicitly with --source. |
| [wait](src/commands/wait.md) | Wait for a duration before executing the next action (fork simulations advance the chain's clock instead). |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@abi.decode](src/helpers/abi.decode.md) | `array` | Decode ABI-encoded bytes into values given a comma-separated type list. |
| [@abi.encodeCall](src/helpers/abi.encodeCall.md) | `bytes` | ABI-encode a function call from its signature and arguments. |
| [@abi.encodePacked](src/helpers/abi.encodePacked.md) | `bytes` | ABI non-standard packed encoding, matching Solidity's abi.encodePacked. |
| [@arr](src/helpers/arr.md) | `array` | Generate an array of sequential integers from start (inclusive) to end (exclusive). |
| [@block](src/helpers/block.md) | `any` | Return [number, timestamp] of the latest or a specific block. |
| [@bool](src/helpers/bool.md) | `bool` | Evaluate a boolean expression or convert a value to a boolean string. |
| [@bytes](src/helpers/bytes.md) | `bytes` | Convert a value to hex bytes, force UTF-8 encoding, or perform a bitwise operation. |
| [@contract.codeAt](src/helpers/contract.codeAt.md) | `bytes` | Return the deployed bytecode at an address. |
| [@contract.next](src/helpers/contract.next.md) | `address` | Predict the next contract address deployed by a given account. |
| [@contract.storageAt](src/helpers/contract.storageAt.md) | `bytes32` | Read a raw storage slot of a contract. |
| [@date](src/helpers/date.md) | `number` | Parse a date string into a Unix timestamp, with an optional offset. |
| [@ens](src/helpers/ens.md) | `address` | Resolve an ENS name to its address. |
| [@gas.estimate](src/helpers/gas.estimate.md) | `number` | Estimate the gas required for a contract call. |
| [@gas.price](src/helpers/gas.price.md) | `number` | Return the current gas price in wei. |
| [@get](src/helpers/get.md) | `any` | Call a read-only contract function and return its result. |
| [@id](src/helpers/id.md) | `bytes32` | Compute the keccak256 hash of a string (first 4 bytes for selectors). |
| [@ipfs](src/helpers/ipfs.md) | `string` | Upload text content to IPFS and return the CID. |
| [@me](src/helpers/me.md) | `address` | Return the connected wallet address. |
| [@nonce](src/helpers/nonce.md) | `number` | Get the transaction count (nonce) of an address. |
| [@num](src/helpers/num.md) | `number` | Evaluate an arithmetic expression or convert a value to a number. |
| [@sigValid](src/helpers/sigValid.md) | `bool` | Verify a signature against an expected signer address. Auto-detects EIP-712 typed data (JSON) vs. plain message. |
| [@str](src/helpers/str.md) | `string` | Convert a value to its string representation, or decode hex bytes as UTF-8. |
| [@token](src/helpers/token.md) | `address` | Resolve a token symbol to its contract address on the current chain. |
| [@token.amount](src/helpers/token.amount.md) | `number` | Convert a human-readable token amount to its base unit (applying decimals). |
| [@token.balance](src/helpers/token.balance.md) | `number` | Fetch the token balance of an address in base units. |

