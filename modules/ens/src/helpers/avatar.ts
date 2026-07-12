import { defineHelper, HelperFunctionError } from "@evmcrispr/sdk";
import { createPublicClient } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import type Ens from "..";

export default defineHelper<Ens>({
  name: "avatar",
  batchable: false,
  description: "Get the avatar URI for an ENS name.",
  returnType: "string",
  args: [
    {
      name: "name",
      type: "string",
      description: "ENS name (e.g. vitalik.eth)",
    },
  ],
  async run(module, { name }, { node }) {
    const client = createPublicClient({
      chain: mainnet,
      transport: module.getTransport(mainnet.id),
    });
    const avatar = await client.getEnsAvatar({ name: normalize(name) });
    if (!avatar) {
      throw new HelperFunctionError(node, `no avatar found for ${name}`);
    }
    return avatar;
  },
});
