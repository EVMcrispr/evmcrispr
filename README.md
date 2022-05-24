# EVMcrispr 🧬

EVMcripsr is a library that can be used to wrap many actions in one vote of an AragonOS DAO, lowering gas costs and dramatically improving the DAO management experience. Between the available actions, you can find installing new Aragon apps, granting or revoking permissions, calling app functions such as minting tokens, withdrawing funds, etc. It works with both AragonOS v4 and v5, supporting complex app forwarding paths.

## Packages

This monorepo contains the following packages:

- [**EVMcrispr**](packages/evmcrispr): The core TS library itself.
- [**Terminal**](packages/evmcrispr-terminal): A web app tool that's meant as a gateway to build evmcrispr scripts in easier and faster way.
