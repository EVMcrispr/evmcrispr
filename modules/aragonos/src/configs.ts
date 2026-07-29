import type { ConfigDef } from "@evmcrispr/sdk";

// Literal-only declarations: docs generation parses this file from source.
export const configs: ConfigDef[] = [
  {
    name: "ensResolver",
    type: "address",
    description:
      "Custom aragonID ENS resolver used to resolve DAO names (forks / testing).",
  },
];
