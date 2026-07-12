import { defineHelper, HelperFunctionError } from "@evmcrispr/sdk";
import { createPublicClient } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import type Ens from "..";

export default defineHelper<Ens>({
  name: "text",
  batchable: false,
  description: "Read a text record from an ENS name.",
  returnType: "string",
  args: [
    {
      name: "name",
      type: "string",
      description: "ENS name (e.g. vitalik.eth)",
    },
    {
      name: "key",
      type: "string",
      description: 'Text record key (e.g. "url", "com.twitter", "description")',
    },
  ],
  async run(module, { name, key }, { node }) {
    const client = createPublicClient({
      chain: mainnet,
      transport: module.getTransport(mainnet.id),
    });
    const text = await client.getEnsText({ name: normalize(name), key });
    if (text === null || text === undefined) {
      throw new HelperFunctionError(
        node,
        `no text record "${key}" found for ${name}`,
      );
    }
    return text;
  },
});
