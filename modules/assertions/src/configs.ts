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
    name: "combinators",
    type: "address",
    description:
      "Override the resolved combinators contract address (forks / testing).",
  },
];
