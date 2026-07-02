import { defineHelper, normalizeEnsName } from "@evmcrispr/sdk";
import type Ens from "..";

export default defineHelper<Ens>({
  name: "ens.normalize",
  description: "Normalize an ENS name per ENSIP-15.",
  returnType: "string",
  args: [
    { name: "name", type: "string", description: "ENS name to normalize" },
  ],
  async run(_, { name }) {
    return normalizeEnsName(name);
  },
});
