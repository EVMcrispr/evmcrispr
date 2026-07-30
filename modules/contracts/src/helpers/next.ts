import { defineHelper } from "@evmcrispr/sdk";
import type Contracts from "..";

export default defineHelper<Contracts>({
  name: "next",
  batchable: false,
  description: "Predict the next contract address deployed by a given account.",
  returnType: "address",
  args: [
    { name: "creator", type: "address", description: "Deployer address" },
    {
      name: "offset",
      type: "number",
      description: "Nonce offset from current",
      optional: true,
    },
  ],
  async run(module, { creator, offset = 0 }) {
    return module.predictNextAddress(creator, offset);
  },
});
