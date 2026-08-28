import type { ConfigDef } from "@evmcrispr/sdk";

// Literal-only declarations: docs generation parses this file from source.
export const configs: ConfigDef[] = [
  {
    name: "registry",
    type: "address",
    description:
      "EEZ registry on the current chain: the L1 `EEZ` contract or the rollup's `EEZL2` predeploy. Known for the EEZ devnet chains; set it to use another deployment (e.g. a local enclave).",
  },
  {
    name: "rollupId",
    type: "number",
    description:
      "EEZ rollup id of the current chain (0 for L1). Known for the EEZ devnet chains.",
  },
  {
    name: "front",
    type: "string",
    description:
      "Cross-chain ingress URL that cross-chain transactions from the current chain are submitted to. Known for the EEZ devnet chains.",
  },
];
