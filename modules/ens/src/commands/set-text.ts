import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Ens from "..";
import { v2Name, v2Resolver } from "../ethRegistry";
import { dnsName, SET_TEXT } from "../permissionedResolver";
import { assertSupportedChain, getNode, getRegistryResolver } from "../utils";

export default defineCommand<Ens>({
  smartSupport: { kind: "runtime" },
  name: "set-text",
  description: "Set a text record on an ENS name.",
  args: [
    { name: "name", type: "string", description: "ENS name (e.g. mydao.eth)" },
    {
      name: "key",
      runtime: true,
      type: "string",
      description: 'Text record key (e.g. "url", "com.twitter")',
    },
    {
      name: "value",
      runtime: true,
      type: "string",
      description: "Text record value",
    },
  ],
  async run(module, { name, key, value }) {
    const chainId = await module.getChainId();
    assertSupportedChain(chainId);
    const client = await module.getClient();
    const v2 = await v2Name(client, chainId, name);
    if (v2) {
      const resolver = await v2Resolver(client, name, v2);
      return [encodeAction(resolver, SET_TEXT, [dnsName(name), key, value])];
    }
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
