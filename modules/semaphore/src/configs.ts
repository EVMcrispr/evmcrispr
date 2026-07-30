import type { ConfigDef } from "@evmcrispr/sdk";

export const configs: ConfigDef[] = [
  {
    name: "address",
    type: "address",
    description:
      "Semaphore v4 contract address override (default: the canonical singleton, same address on every supported chain).",
  },
  {
    name: "deployBlock",
    type: "number",
    description:
      "Block the Semaphore contract was deployed at, bounding member event scans on chains without a built-in entry.",
  },
];
