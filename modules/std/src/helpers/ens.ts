import { defineHelper, HelperFunctionError } from "@evmcrispr/sdk";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import type Std from "..";

const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

function _ens(name: string) {
  return mainnetClient.getEnsAddress({ name });
}

export default defineHelper<Std>({
  name: "ens",
  args: [{ name: "name", type: "string" }],
  async run(_, { name }, { node }) {
    const addr = await _ens(name);
    if (!addr) {
      throw new HelperFunctionError(node, `ENS name ${name} not found`);
    }
    return addr;
  },
});
