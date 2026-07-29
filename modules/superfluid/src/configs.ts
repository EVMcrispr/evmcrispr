import type { ConfigDef } from "@evmcrispr/sdk";

// Literal-only declarations: docs generation parses this file from source.
export const configs: ConfigDef[] = [
  {
    name: "tokenlist",
    type: "string",
    description:
      "Superfluid extended tokenlist URL used to resolve SuperToken symbols (must be HTTPS).",
    default:
      "https://tokenlist.superfluid.org/superfluid.extended.tokenlist.json",
  },
];
