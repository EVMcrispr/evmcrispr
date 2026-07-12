import { defineHelper, HelperFunctionError } from "@evmcrispr/sdk";
import { createPublicClient } from "viem";
import { mainnet } from "viem/chains";
import type Ens from "..";

export default defineHelper<Ens>({
  name: "name",
  batchable: false,
  description: "Reverse-resolve an address to its primary ENS name.",
  returnType: "string",
  args: [
    { name: "address", type: "address", description: "Address to resolve" },
  ],
  async run(module, { address }, { node }) {
    const client = createPublicClient({
      chain: mainnet,
      transport: module.getTransport(mainnet.id),
    });
    const name = await client.getEnsName({ address });
    if (!name) {
      throw new HelperFunctionError(
        node,
        `no primary ENS name found for ${address}`,
      );
    }
    return name;
  },
});
