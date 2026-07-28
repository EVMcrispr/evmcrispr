---
title: Running Scripts
---

There are three ways to run an EVML script. They all execute the same
language — pick the surface that fits how you work.

## Web Terminal

[next.evmcrispr.com](https://next.evmcrispr.com) is the primary way to use
EVMcrispr: a browser editor with syntax highlighting, completions, inline
diagnostics, and hover documentation. Connect your wallet, write a script,
and click **Execute** — every transaction is shown to you for review and
signed by your own wallet.

The terminal can also [share scripts as links](/guides/sharing-scripts/)
and simulate them on a forked chain before you commit to anything.

## CLI

The `evmcrispr` npm package runs scripts from your shell — useful for CI,
cron jobs, and keeping scripts in a repository:

```sh
# Validate a script offline (no RPC)
npx evmcrispr validate my-script.evml

# Simulate it on a forked chain
npx evmcrispr simulate my-script.evml

# Pin it to IPFS and print a link that opens it in the terminal
npx evmcrispr create-link "My proposal" my-script.evml
```

Configuration is via environment variables — set `VITE_DRPC_API_KEY` for
RPC access, `VITE_PINATA_JWT` for IPFS pinning, and
`EVMCRISPR_DEFAULT_CHAIN_ID` / `EVMCRISPR_RPC_URL` to control which chain
scripts run against. Run `npx evmcrispr` with no arguments for the full
list.

The CLI validates and simulates; it does not hold keys or execute
transactions. Execution always happens in the terminal with your wallet.

## AI Assistants (MCP)

EVMcrispr ships a hosted [MCP server](/guides/mcp/) so assistants like
Claude, ChatGPT, and Cursor can write, validate, and simulate EVML for you —
and hand you a link that opens the finished script in the terminal for
review and execution.

## Next Steps

- [How EVMcrispr Works](what-is-evmcrispr.md) — what happens between script and transaction
- [Simulation](/guides/simulation/) — test scripts before executing them
