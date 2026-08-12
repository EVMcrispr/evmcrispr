# evmcrispr

[![](https://img.shields.io/npm/v/evmcrispr.svg?logo=npm)](https://www.npmjs.com/package/evmcrispr)

**_EVMcrispr is still in active development and its API might change until it reaches 1.0._**

The EVMcrispr command line. EVMcrispr runs **EVML** scripts — a DSL for encoding batches of on-chain actions (contract calls, DAO operations, token transfers, deployments) that can be simulated on a fork before being executed.

For the full experience — editor with autocompletion, wallet execution, sharing — use the terminal at [evmcrispr.com](https://evmcrispr.com).

## Usage

```sh
bunx evmcrispr <command>   # or: npm i -g evmcrispr
```

```
Commands:
  simulate <file>                        Simulate an EVML script
  validate <file>                        Validate an EVML script (offline, no RPC)
  create-link <title> <file> [base-url]  Pin script to IPFS and print a shareable link

Options:
  --experimental             Enable experimental modules, commands and helpers
```

Pass `-` as the file to read from stdin.

```sh
$ cat > donate.evml <<'EOF'
switch gnosis
load giveth
giveth:donate 10e18 @token(XDAI) to evmcrispr
EOF

$ evmcrispr simulate donate.evml
```

`validate` prints JSON diagnostics and exits non-zero on errors, which makes it easy to wire into CI or editor tooling:

```sh
$ echo "exec @token(DAI) transfer(address,uint256) vitalik.eth 1e18" | evmcrispr validate -
```

## Environment

| Variable | Purpose |
| --- | --- |
| `VITE_DRPC_API_KEY` | DRPC API key for RPC access |
| `VITE_PINATA_JWT` | Pinata JWT for IPFS pinning (`create-link`) |
| `VITE_ETHERSCAN_API_KEY` | Etherscan V2 API key for verified-contract metadata |
| `VITE_PUBLIC_EXPERIMENTAL` | Enable experimental features (same as `--experimental`) |
| `EVMCRISPR_DEFAULT_CHAIN_ID` | Default chain ID (default: 1) |
| `EVMCRISPR_RPC_URL` | Global RPC URL override |
| `EVMCRISPR_RPC_URL_<ID>` | Per-chain RPC URL override |

## Embedding

To run EVML from your own code, use [`@evmcrispr/core`](https://www.npmjs.com/package/@evmcrispr/core) directly instead of shelling out to the CLI.

## Contributing

We welcome community contributions!

Please check out our open [Issues](https://github.com/EVMcrispr/evmcrispr/issues) to get started.
