import type { ConfigDef } from "@evmcrispr/sdk";

// Literal-only declarations: docs generation parses this file from source.
export const configs: ConfigDef[] = [
  {
    name: "tokenlist",
    type: "string",
    description: "Tokenlist URL used to resolve token symbols (must be HTTPS).",
    default: "https://api.evmcrispr.com/tokenlist/{chainId}",
  },
  {
    name: "ipfsJwt",
    type: "string",
    description: "Pinata JWT used by @ipfs to upload content.",
  },
];
