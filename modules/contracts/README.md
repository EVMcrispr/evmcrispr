# contracts module

Contract lifecycle commands and helpers for EVML scripts: deploy creation bytecode (CREATE, CREATE2, CREATE3, or mirroring an existing deployment), verify source code on Etherscan V2, inspect deployed code and storage, and compile Solidity from inline source or a URL with the @solidity helpers.

```evml
load contracts
```

## Commands

| Command | Description |
|---------|-------------|
| [contracts:deploy](src/commands/deploy.md) | Deploy a contract from raw creation bytecode. Binds the predicted address to <variable>. Mirror an existing deployment with --mirror-chain / --mirror-address (fetches the original creation bytecode from Etherscan). |
| [contracts:verify](src/commands/verify.md) | Submit Solidity Standard JSON Input source code to Etherscan V2 for verification at <address>. Mirror an existing verification with --mirror-chain / --mirror-address, or supply source explicitly with --source. Inside sim:fork this becomes a local dry-run: the source is compiled and checked against the fork's deployed bytecode instead of being sent to Etherscan. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@contracts:account](src/helpers/account.md) ⚗️ | `string` | Human-readable summary of an address: EOA / contract / EIP-7702-delegated EOA, verified contract name, proxy implementation, ENS name, balance and tx count. |
| [@contracts:codeAt](src/helpers/codeAt.md) | `bytes` | Deployed bytecode at an address. |
| [@contracts:next](src/helpers/next.md) | `address` | Predict the next contract address deployed by a given account. |
| [@contracts:slot.array](src/helpers/slot.array.md) | `bytes32` | Derive the storage slot of element index of a dynamic array declared at a base slot: keccak256(base) + index. |
| [@contracts:slot.erc7201](src/helpers/slot.erc7201.md) | `bytes32` | Derive the root slot of an ERC-7201 namespaced storage layout: keccak256(abi.encode(uint256(keccak256(id)) - 1)) & ~0xff. |
| [@contracts:slot.mapping](src/helpers/slot.mapping.md) | `bytes32` | Derive the storage slot of mapping[key] for a mapping declared at a base slot: keccak256(h(key) . base). |
| [@contracts:solidity](src/helpers/solidity.md) ⚗️ | `bytes` | Compile Solidity source (inline text or a http/ipfs URL) and return the creation bytecode, ready for `deploy`. Options: version:<x.y.z>, runs:<n>, optimizer:false, via-ir:true, evm:<version>, contract:<Name>, libraries:[[Name 0x…]]. |
| [@contracts:solidity.compiler](src/helpers/solidity.compiler.md) ⚗️ | `string` | Compile Solidity source (inline text or a http/ipfs URL) and return the long compiler version (`0.8.26+commit.8a97fa7a`), ready for `verify --compiler`. Pass the same options as the matching @solidity call so the cached compile is reused. |
| [@contracts:solidity.contract](src/helpers/solidity.contract.md) ⚗️ | `string` | Compile Solidity source (inline text or a http/ipfs URL) and return the qualified contract name (`File.sol:Contract`), ready for `verify --contract-name`. Pass the same options as the matching @solidity call so the cached compile is reused. |
| [@contracts:solidity.standardJson](src/helpers/solidity.standardJson.md) ⚗️ | `string` | Compile Solidity source (inline text or a http/ipfs URL) and return the exact solc Standard JSON Input text, ready for `verify --source`. Pass the same options as the matching @solidity call so the cached compile is reused. |
| [@contracts:storageAt](src/helpers/storageAt.md) | `bytes32` | Read a raw storage slot of a contract. |

