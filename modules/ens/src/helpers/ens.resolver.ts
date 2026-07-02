import { defineHelper, HelperFunctionError } from "@evmcrispr/sdk";
import { normalize } from "viem/ens";
import type Ens from "..";
import { mainnetClient } from "../utils";

export default defineHelper<Ens>({
  name: "ens.resolver",
  batchable: false,
  description: "Get the resolver contract address of an ENS name.",
  returnType: "address",
  args: [
    {
      name: "name",
      type: "string",
      description: "ENS name (e.g. vitalik.eth)",
    },
  ],
  async run(module, { name }, { node }) {
    const client = mainnetClient(module);
    const resolver = await client.getEnsResolver({ name: normalize(name) });
    if (!resolver) {
      throw new HelperFunctionError(node, `no resolver found for ${name}`);
    }
    return resolver;
  },
});
