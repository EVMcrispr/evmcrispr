import { defineHelper, HelperFunctionError, resolveName } from "@evmcrispr/sdk";
import { createPublicClient } from "viem";
import { mainnet } from "viem/chains";
import type Std from "..";

export default defineHelper<Std>({
  name: "ens",
  returnType: "address",
  args: [{ name: "name", type: "string" }],
  async run(module, { name }, { node }) {
    const client = createPublicClient({
      chain: mainnet,
      transport: module.getTransport(mainnet.id),
    });
    const addr = await resolveName(name, client);
    if (!addr) {
      throw new HelperFunctionError(node, `ENS name ${name} not found`);
    }
    return addr;
  },
});
