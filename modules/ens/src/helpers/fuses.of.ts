import { defineHelper, HelperFunctionError } from "@evmcrispr/sdk";
import { mainnet } from "viem/chains";
import type Ens from "..";
import { decodeFuses } from "../fuses";
import { getNode, getWrappedData, isWrapped, mainnetClient } from "../utils";

export default defineHelper<Ens>({
  name: "fuses.of",
  batchable: false,
  description: "Get the burned fuse names of a wrapped ENS name.",
  returnType: "array",
  args: [{ name: "name", type: "string", description: "Wrapped ENS name" }],
  async run(module, { name }, { node }) {
    const client = mainnetClient(module);
    const ensNode = getNode(name);
    if (!(await isWrapped(client, mainnet.id, ensNode))) {
      throw new HelperFunctionError(node, `${name} is not wrapped`);
    }
    const { fuses } = await getWrappedData(client, mainnet.id, ensNode);
    return decodeFuses(fuses);
  },
});
