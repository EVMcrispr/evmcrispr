import { defineHelper, HelperFunctionError } from "@evmcrispr/sdk";
import { zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import type Ens from "..";
import {
  getNode,
  getRegistryOwner,
  getWrappedData,
  isWrapped,
  mainnetClient,
} from "../utils";

export default defineHelper<Ens>({
  name: "owner",
  batchable: false,
  description:
    "Owner of an ENS name (the real owner when the name is wrapped).",
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
    const ensNode = getNode(name);
    if (await isWrapped(client, mainnet.id, ensNode)) {
      const { owner } = await getWrappedData(client, mainnet.id, ensNode);
      return owner;
    }
    const owner = await getRegistryOwner(client, mainnet.id, ensNode);
    if (owner === zeroAddress) {
      throw new HelperFunctionError(node, `no owner found for ${name}`);
    }
    return owner;
  },
});
