import type { ConfigDef } from "@evmcrispr/sdk";

// Literal-only declarations: docs generation parses this file from source.
export const configs: ConfigDef[] = [
  {
    name: "address",
    type: "address",
    description:
      "Override the resolved assertions contract address (forks / testing).",
  },
  {
    name: "operators",
    type: "address",
    description:
      "Override the resolved operators contract address (forks / testing).",
  },
];
