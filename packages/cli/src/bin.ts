#!/usr/bin/env bun
export {};

const USAGE = `Usage: evmcrispr <command> [options]

Commands:
  simulate <file>                        Simulate an EVML script
  validate <file>                        Validate an EVML script (offline, no RPC)
  create-link <title> <file> [base-url]  Pin script to IPFS and print a shareable link

Options:
  --experimental             Enable experimental modules, commands and helpers

Environment:
  VITE_DRPC_API_KEY          DRPC API key for RPC access
  VITE_PINATA_JWT            Pinata JWT for IPFS pinning
  VITE_ETHERSCAN_API_KEY     Etherscan V2 API key for verified-contract metadata
  VITE_PUBLIC_EXPERIMENTAL   Enable experimental features (same as --experimental)
  EVMCRISPR_DEFAULT_CHAIN_ID Default chain ID (default: 1)
  EVMCRISPR_RPC_URL          Global RPC URL override
  EVMCRISPR_RPC_URL_<ID>     Per-chain RPC URL override
`;

/* Strip --experimental before dispatch: gating is read at import time by the
 * module registry, so the env must be set before any command module loads. */
const rawArgs = process.argv.slice(2);
const argv = rawArgs.filter((arg) => arg !== "--experimental");
if (argv.length !== rawArgs.length) {
  process.env.VITE_PUBLIC_EXPERIMENTAL = "true";
}

const [command, ...args] = argv;

switch (command) {
  case "simulate": {
    const { runSimulate } = await import("./commands/simulate.js");
    await runSimulate(args);
    break;
  }
  case "validate": {
    const { runValidate } = await import("./commands/validate.js");
    await runValidate(args);
    break;
  }
  case "create-link": {
    const { runCreateLink } = await import("./commands/create-link.js");
    await runCreateLink(args);
    break;
  }
  default:
    console.log(USAGE);
    process.exit(command ? 1 : 0);
}
