import { createPublicClient, http } from "viem";

import { mainnet } from "viem/chains";
import { HelperFunctionError } from "../../../errors";
import { defineHelper } from "../../../utils";
import type { Std } from "../Std";

const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

function _ens(name: string) {
  return mainnetClient.getEnsAddress({ name });
}

export const ens = defineHelper<Std>({
  args: [{ name: "name", type: "string" }],
  async run(_, { name }, { node }) {
    const addr = await _ens(name);
    if (!addr) {
      throw new HelperFunctionError(node, `ENS name ${name} not found`);
    }
    return addr;
  },
});
