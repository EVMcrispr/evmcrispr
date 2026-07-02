import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Ens from "..";
import { assertSupportedChain, getNode, getRegistryResolver } from "../utils";

export default defineCommand<Ens>({
  name: "set-text",
  description: "Set a text record on an ENS name.",
  args: [
    { name: "name", type: "string", description: "ENS name (e.g. mydao.eth)" },
    {
      name: "key",
      type: "string",
      description: 'Text record key (e.g. "url", "com.twitter")',
    },
    { name: "value", type: "string", description: "Text record value" },
  ],
  async run(module, { name, key, value }) {
    const chainId = await module.getChainId();
    assertSupportedChain(chainId);
    const client = await module.getClient();
    const node = getNode(name);
    const resolver = await getRegistryResolver(client, chainId, node, name);
    return [
      encodeAction(resolver, "setText(bytes32,string,string)", [
        node,
        key,
        value,
      ]),
    ];
  },
});
