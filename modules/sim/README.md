# sim module

Simulation module: fork chains and execute commands in a sandboxed environment using Anvil, Hardhat, Tenderly, or EthereumJS backends.

```evml
load sim
```

## Commands

| Command | Description |
|---------|-------------|
| [sim:expect](src/commands/expect.md) | Assert that a condition is true. |
| [sim:fork](src/commands/fork.md) | Fork the blockchain and execute commands in a simulation. |
| [sim:set-balance](src/commands/set-balance.md) | Set the ETH balance of an account in a fork simulation. |
| [sim:set-code](src/commands/set-code.md) | Set the bytecode at an address in a fork simulation. |
| [sim:set-storage-at](src/commands/set-storage-at.md) | Set a storage slot value at an address in a fork simulation. |
| [sim:wait](src/commands/wait.md) | Advance time and mine blocks in a fork simulation. |

