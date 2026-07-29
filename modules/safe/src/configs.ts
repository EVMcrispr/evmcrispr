import type { ConfigDef } from "@evmcrispr/sdk";

// Literal-only declarations: docs generation parses this file from source.
export const configs: ConfigDef[] = [
  {
    name: "serviceUrl",
    type: "string",
    description:
      "Custom Safe transaction-service endpoint for the current chain.",
  },
  {
    name: "apiKey",
    type: "string",
    description: "API key sent to the Safe transaction service.",
  },
];
